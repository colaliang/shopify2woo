import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { importApi, ProductData, LogEntry, ParseListingRequest } from '@/services/importApi';
import supabase from '@/lib/supabase';
import { useUserStore } from '@/stores/userStore';

export type ImportState = 'idle' | 'parsing' | 'running' | 'stopped' | 'stopping' | 'completed' | 'error';

interface ImportStore {
  // State
  status: ImportState;
  products: ProductData[];
  logs: LogEntry[];
  results: Array<{ id: string; timestamp: string; status: 'success' | 'error'; message?: string; name?: string; productId?: string; itemKey?: string; destUrl?: string; imageUrl?: string; price?: string; galleryCount?: number }>;
  resultsPage: number;
  resultsTotal: number;
  resultsLimit: number;
  resultsLoading: boolean;
  stats: {
    fetched: number;
    queue: number;
    imported: number;
    errors: number;
    progress: number;
  };
  
  // UI State
  selectedProducts: Set<string>;
  isLoading: boolean;
  error: string | null;
  productUrl: string;
  listingUrl: string;
  
  // Actions
  setProductUrl: (url: string) => void;
  setListingUrl: (url: string) => void;
  parseListing: (url: string, options?: ParseListingRequest['options']) => Promise<void>;
  importProduct: (productId: string) => Promise<void>;
  importSelectedProducts: () => Promise<void>;
  enqueueLinks: (links: string[], sourceHint?: string, platform?: 'wordpress' | 'shopify' | 'wix') => Promise<void>;
  stopImport: () => Promise<void>;
  toggleProductSelection: (productId: string) => void;
  selectAllProducts: () => void;
  deselectAllProducts: () => void;
  refreshStatus: () => Promise<void>;
  refreshLogs: () => Promise<void>;
  clearError: () => void;
  setProducts: (products: ProductData[]) => void;
  startLogsForRequest: (requestId: string) => void;
  stopLogs: () => void;
  currentRequestId: string | null;
  startResultsForRequest: (requestId: string, clear?: boolean) => void;
  stopResults: () => void;
  startRunnerAutoCall: () => void;
  stopRunnerAutoCall: () => void;
  fetchUserResults: (page?: number) => Promise<void>;
}

export const useImportStore = create<ImportStore>()(persist((set, get) => ({
  // Initial state
  status: 'idle',
  products: [],
  logs: [],
  results: [],
  resultsPage: 1,
  resultsTotal: 0,
  resultsLimit: 10,
  resultsLoading: false,
  stats: {
    fetched: 0,
    queue: 0,
    imported: 0,
    errors: 0,
    progress: 0,
  },
  selectedProducts: new Set(),
  isLoading: false,
  error: null,
  currentRequestId: null,
  productUrl: '',
  listingUrl: '',

  setProductUrl: (url: string) => set({ productUrl: url }),
  setListingUrl: (url: string) => set({ listingUrl: url }),

  // Parse listing action
  parseListing: async (url: string, options?: ParseListingRequest['options']) => {
    set({ isLoading: true, error: null, status: 'parsing' });
    
    try {
      const result = await importApi.parseListing({ url, options });
      
      set({
        products: result.products,
        status: 'completed',
        isLoading: false,
        stats: {
          fetched: result.products.length,
          queue: 0,
          imported: 0,
          errors: 0,
          progress: 0,
        },
      });

      // Add success log
      const newLog: LogEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        level: 'success',
        message: `Successfully parsed ${result.products.length} products from ${url}`,
      };
      
      set((state) => ({
        logs: [newLog, ...state.logs].slice(0, 100),
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to parse listing';
      
      set({
        error: errorMessage,
        status: 'error',
        isLoading: false,
      });

      // Add error log
      const errorLog: LogEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Failed to parse listing: ${errorMessage}`,
      };
      
      set((state) => ({
        logs: [errorLog, ...state.logs].slice(0, 100),
      }));
    }
  },

  // Import single product
  importProduct: async (productId: string) => {
    const { products } = get();
    const product = products.find(p => p.id === productId);
    if (!product) {
      set({ error: 'Product not found' });
      return;
    }
    // Reset stats for new single import
    set((state) => ({
      isLoading: true,
      error: null,
      status: 'running',
      stats: {
        ...state.stats,
        fetched: 1,
        queue: 0,
        imported: 0,
        errors: 0,
        progress: 0,
      }
    }));
    try {
      const res = await importApi.enqueueWordpress({ sourceUrl: '', mode: 'links', productLinks: [product.link], cap: 1, priority: 'normal' });
      set({ currentRequestId: res.requestId });
      get().startLogsForRequest(res.requestId);
      get().startResultsForRequest(res.requestId);
      get().startRunnerAutoCall();
      set((state) => ({ stats: { ...state.stats, queue: res.count || 1 } }));
      await get().refreshStatus();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'enqueue failed';
      set({ error: msg, status: 'error', isLoading: false });
      const errorLog: LogEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Import failed: ${msg}`,
      };
      set((state) => ({ logs: [errorLog, ...state.logs].slice(0, 100) }));
    }
  },

  // Import selected products
  importSelectedProducts: async () => {
    const { selectedProducts, products } = get();
    try { if (!useUserStore.getState().isAuthenticated) { useUserStore.getState().openLoginModal(); return; } } catch {}
    if (selectedProducts.size === 0) {
      set({ error: 'No products selected' });
      return;
    }
    const list = products.filter(p => selectedProducts.has(p.id));
    const links = list.map(p => p.link).filter(Boolean);
    // Reset stats for new batch import
    set((state) => ({
      isLoading: true,
      error: null,
      status: 'running',
      stats: {
        ...state.stats,
        fetched: links.length,
        queue: 0,
        imported: 0,
        errors: 0,
        progress: 0,
      }
    }));
    try {
      const res = await importApi.enqueueWordpress({ sourceUrl: '', mode: 'links', productLinks: links, cap: links.length, priority: 'normal' });
      set({ selectedProducts: new Set(), currentRequestId: res.requestId });
      get().startLogsForRequest(res.requestId);
      get().startResultsForRequest(res.requestId);
      get().startRunnerAutoCall();
      set((state) => ({ stats: { ...state.stats, queue: res.count || links.length } }));
      await get().refreshStatus();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'enqueue failed';
      set({ error: msg, status: 'error', isLoading: false });
      const errorLog: LogEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Batch import failed: ${msg}`,
      };
      set((state) => ({ logs: [errorLog, ...state.logs].slice(0, 100) }));
    }
  },

  enqueueLinks: async (links: string[], sourceHint?: string, platform: 'wordpress' | 'shopify' | 'wix' = 'wordpress') => {
    if (!links || links.length === 0) return;
    try { if (!useUserStore.getState().isAuthenticated) { useUserStore.getState().openLoginModal(); return; } } catch {}
    // Reset stats for new direct link import
    set((state) => ({
      isLoading: true,
      error: null,
      status: 'running',
      stats: {
        ...state.stats,
        fetched: links.length,
        queue: 0,
        imported: 0,
        errors: 0,
        progress: 0,
      }
    }));
    try {
      let res;
      const baseUrl = sourceHint || (links[0] ? new URL(links[0]).origin : '');
      if (platform === 'shopify') {
        res = await importApi.enqueueShopify({ shopifyBaseUrl: baseUrl, mode: 'links', productLinks: links, cap: links.length });
      } else if (platform === 'wix') {
        res = await importApi.enqueueWix({ sourceUrl: baseUrl, mode: 'links', productLinks: links, cap: links.length });
      } else {
        res = await importApi.enqueueWordpress({ sourceUrl: baseUrl, mode: 'links', productLinks: links, cap: links.length, priority: 'normal' });
      }
      set({ currentRequestId: res.requestId });
      get().startLogsForRequest(res.requestId);
      get().startResultsForRequest(res.requestId);
      get().startRunnerAutoCall();
      set((state) => ({ stats: { ...state.stats, queue: res.count || links.length } }));
      await get().refreshStatus();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'enqueue failed';
      set({ error: msg, status: 'error', isLoading: false });
      const errorLog: LogEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Enqueue failed: ${msg}`,
      };
      set((state) => ({ logs: [errorLog, ...state.logs].slice(0, 100) }));
    }
  },

  // Stop import
  stopImport: async () => {
    set({ isLoading: true, status: 'stopping' });
    
    // Immediately clear UI state to 'stopped' after a short delay if API is slow
    // We race the API call with a timeout
    const stopPromise = (async () => {
      try {
        const rid = get().currentRequestId;
        if (rid) {
          await importApi.cancel(rid);
        }
        
        // Poll for queue empty - reduce timeout to 5s
        if (rid) {
          for (let i = 0; i < 5; i++) {
            try {
               const qs = await importApi.getQueueStats(rid);
               // If queue is empty for request, we are done
               if (qs && qs.queueEmptyForRequest) {
                 break;
               }
            } catch {}
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      } catch (error) {
        console.error('Stop import error:', error);
      }
    })();

    // Wait max 2 seconds for the API, then force stop UI
    await Promise.race([
        stopPromise,
        new Promise(r => setTimeout(r, 2000))
    ]);

    set({ status: 'stopped', isLoading: false, currentRequestId: null });
    get().stopLogs();
    get().stopResults();
    get().stopRunnerAutoCall();
    // Try one last refresh but don't block
    get().refreshStatus().catch(() => {});

    // Add stopped log
    const stoppedLog: LogEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      level: 'info',
      message: '任务已停止（用户取消）',
    };
    
    set((state) => ({
      logs: [stoppedLog, ...state.logs].slice(0, 100),
    }));
  },

  // Toggle product selection
  toggleProductSelection: (productId: string) => {
    set((state) => {
      const newSelected = new Set(state.selectedProducts);
      if (newSelected.has(productId)) {
        newSelected.delete(productId);
      } else {
        newSelected.add(productId);
      }
      return { selectedProducts: newSelected };
    });
  },

  // Select all products
  selectAllProducts: () => {
    set((state) => ({
      selectedProducts: new Set(state.products.map(p => p.id)),
    }));
  },

  // Deselect all products
  deselectAllProducts: () => {
    set({ selectedProducts: new Set() });
  },

  // Refresh status
  refreshStatus: async () => {
    try {
      const rid = get().currentRequestId || '';
      const qs = await importApi.getQueueStats(rid);
      const s = get();
      
      // Use DB counts from backend if available, otherwise keep local state
      const imported = typeof qs.counts?.imported === 'number' ? qs.counts!.imported : s.stats.imported;
      const errors = typeof qs.counts?.errors === 'number' ? qs.counts!.errors : s.stats.errors;
      const processed = imported + errors;
      
      // Keep original queue size (total expected) to show accurate progress (e.g. 5/10)
      // Do NOT reduce queue size to match processed count when queue is empty
      // Fallback to fetched count if queue is 0 (e.g. lost state after refresh)
      const queue = s.stats.queue || s.stats.fetched;
      
      const progress = queue ? Math.round((processed / queue) * 100) : 0;
      set({ stats: { ...s.stats, queue, imported, errors, progress } });

      // Completion Logic: Only complete when processed count meets expected total
      // We do NOT rely on queueEmptyForRequest alone because invisible messages (processing) make queue appear empty
      if (s.status === 'running' && queue > 0 && processed >= queue) {
        set({ status: 'completed', currentRequestId: null, isLoading: false });
        get().stopRunnerAutoCall();
        try { get().stopLogs(); } catch {}
        try { get().stopResults(); } catch {}

        // Add success log
        const doneLog: LogEntry = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          level: 'success',
          message: `任务完成。成功: ${imported}, 失败: ${errors}`,
        };
        set((state) => ({ logs: [doneLog, ...state.logs].slice(0, 100) }));
      }
    } catch (error) {
      console.error('Failed to refresh status:', error);
    }
  },

  // Refresh logs
  refreshLogs: async () => {
    try {
      const logs = await importApi.getLogs(100);
      set({ logs });
    } catch (error) {
      console.error('Failed to refresh logs:', error);
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },

  // Set products directly
  setProducts: (products: ProductData[]) => {
    set({ products });
  },

  startLogsForRequest: (requestId: string) => {
    set({ logs: [] });
    const st = get() as unknown as { __realtimeChannel?: ReturnType<typeof supabase.channel> };
    if (st.__realtimeChannel) {
      try { supabase.removeChannel(st.__realtimeChannel); } catch {}
    }
    const uid = useUserStore.getState().user?.id || '';
    const ch = supabase.channel('import_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'import_logs', ...(uid ? { filter: `user_id=eq.${uid}` } : {}), filter: `request_id=eq.${requestId}` }, (payload) => {
        const n = payload.new as { level: 'info' | 'error'; message: string; created_at: string };
        const item: LogEntry = {
          id: Math.random().toString(36).slice(2),
          timestamp: n.created_at,
          level: n.level === 'error' ? 'error' : 'info',
          message: n.message,
        };
        // Debug log to console as per request for "Detailed logs in debug window"
        console.log(`[Import Log] ${item.timestamp} [${item.level}] ${item.message}`);
        set((state) => ({ logs: [item, ...state.logs].slice(0, 100) }));
      })
      .subscribe();
    (st as { __realtimeChannel?: ReturnType<typeof supabase.channel> }).__realtimeChannel = ch;
  },

  stopLogs: () => {
    const st = get() as unknown as { __realtimeChannel?: ReturnType<typeof supabase.channel> };
    if (st.__realtimeChannel) {
      try { supabase.removeChannel(st.__realtimeChannel); } catch {}
      (st as { __realtimeChannel?: ReturnType<typeof supabase.channel> }).__realtimeChannel = undefined;
    }
    // Do not clear logs here, keep them for display
  },

  startResultsForRequest: (requestId: string) => {
    // We do NOT clear results by default anymore because we want to show history.
    // But if 'clear' is explicitly true, we might reset pagination?
    // Actually, startResultsForRequest is for REALTIME subscription now.
    // The initial fetch should be handled by fetchUserResults.
    // Arg 'clear' is removed from implementation as it is unused.

    const st = get() as unknown as { __resultsChannel?: ReturnType<typeof supabase.channel>; __statsInterval?: number };
    
    // Clear existing interval if any
    if (st.__statsInterval) {
      clearInterval(st.__statsInterval);
      (st as { __statsInterval?: number }).__statsInterval = undefined;
    }

    if (st.__resultsChannel) {
      // If we already have a channel, do we need to restart it?
      // If the filter changed (e.g. different user?), yes.
      // But for now, let's assume we just want to ensure we are subscribed to the USER's results.
      // If we strictly follow "requestId" argument, we might limit ourselves.
      // Given the user wants "User based results", we should filter by user_id.
      // We will ignore requestId for the filter to allow ALL user updates.
      // But we should checks if the channel is already established for this user?
      // For simplicity, let's recreate it to be safe.
      try { supabase.removeChannel(st.__resultsChannel); } catch {}
    }
    const uid = useUserStore.getState().user?.id || '';
    if (!uid) return; // Cannot subscribe without user id

    // Start polling for accurate stats (fix for task stuck/count drift)
    const pollStats = async () => {
      const s = get();
      if (s.status !== 'running' && s.status !== 'parsing') return;
      
      try {
        const qs = await importApi.getQueueStats(requestId);
        if (qs.counts) {
             set((state) => {
                 const imported = qs.counts?.imported || state.stats.imported;
                 const errors = qs.counts?.errors || state.stats.errors;
                 const processed = imported + errors;
                 // Fallback to fetched count if queue is 0
                 const queue = state.stats.queue || state.stats.fetched;
                 const progress = queue ? Math.round((processed / queue) * 100) : 0;
                 
                 // Check completion based on server stats
                 // Only complete when processed count meets expected total
                 // We do NOT rely on queueEmptyForRequest alone because invisible messages (processing) make queue appear empty
                 if (queue > 0 && processed >= queue) {
                     console.log('[Poll] Task Completed via Server Stats!');
                     setTimeout(() => {
                         set({ status: 'completed', currentRequestId: null, isLoading: false });
                         get().stopRunnerAutoCall();
                         get().stopLogs();
                         get().stopResults();
                     }, 1000);
                 }
                 
                 return {
                     stats: { ...state.stats, imported, errors, progress }
                 };
             });
        }
      } catch {}
    };

    // Poll every 3 seconds
    const iv = setInterval(pollStats, 3000) as unknown as number;
    (st as { __statsInterval?: number }).__statsInterval = iv;

    const ch = supabase.channel('import_results')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'import_results', filter: `user_id=eq.${uid}` }, (payload) => {
        console.log('[Realtime] Received payload:', payload);
        const n = payload.new as { status: 'success' | 'error'; message?: string; name?: string; product_id?: string; item_key?: string; dest_url?: string; image_url?: string; price?: string; gallery_count?: number; created_at: string };
        
        // Handle different event types
        if (payload.eventType === 'INSERT') {
            const item = {
              id: Math.random().toString(36).slice(2),
              timestamp: n.created_at,
              status: n.status,
              message: n.message,
              name: n.name,
              productId: n.product_id,
              itemKey: n.item_key,
              destUrl: n.dest_url,
              imageUrl: n.image_url,
              price: n.price,
              galleryCount: n.gallery_count,
            };
            set((state) => {
              const imported = state.stats.imported + (n.status === 'success' ? 1 : 0);
              const errors = state.stats.errors + (n.status === 'error' ? 1 : 0);
              const processed = imported + errors;
              const progress = state.stats.queue ? Math.round((processed / state.stats.queue) * 100) : 0;
              console.log(`[Realtime] Progress: ${processed}/${state.stats.queue} (${progress}%)`);
              
              // Insert at top only if we are on page 1
              let newResults = state.results;
              if (state.resultsPage === 1) {
                  newResults = [item, ...state.results];
                  if (newResults.length > state.resultsLimit) {
                      newResults = newResults.slice(0, state.resultsLimit);
                  }
              }
              
              return {
                results: newResults,
                resultsTotal: state.resultsTotal + 1,
                stats: { ...state.stats, imported, errors, progress },
              };
            });
        } else if (payload.eventType === 'UPDATE') {
            set((state) => {
                const existingIdx = state.results.findIndex(r => r.itemKey === n.item_key);
                if (existingIdx === -1) {
                    // Treat as insert if not found (shouldn't happen often if synced)
                    // Only insert if on page 1
                    if (state.resultsPage !== 1) {
                        return { stats: state.stats }; // Just update stats?
                    }
                    
                    const item = {
                        id: Math.random().toString(36).slice(2),
                        timestamp: n.created_at,
                        status: n.status,
                        message: n.message,
                        name: n.name,
                        productId: n.product_id,
                        itemKey: n.item_key,
                        destUrl: n.dest_url,
                        imageUrl: n.image_url,
                        price: n.price,
                        galleryCount: n.gallery_count,
                    };
                    const imported = state.stats.imported + (n.status === 'success' ? 1 : 0);
                    const errors = state.stats.errors + (n.status === 'error' ? 1 : 0);
                    const processed = imported + errors;
                    const progress = state.stats.queue ? Math.round((processed / state.stats.queue) * 100) : 0;
                    console.log(`[Realtime] Progress (Update as Insert): ${processed}/${state.stats.queue} (${progress}%)`);
                    return {
                        results: [item, ...state.results].slice(0, state.resultsLimit),
                        resultsTotal: state.resultsTotal + 1,
                        stats: { ...state.stats, imported, errors, progress },
                    };
                } else {
                    // Update existing
                    const oldItem = state.results[existingIdx];
                    const newResults = [...state.results];
                    newResults[existingIdx] = {
                        ...oldItem,
                        status: n.status,
                        message: n.message,
                        name: n.name || oldItem.name,
                        productId: n.product_id || oldItem.productId,
                        destUrl: n.dest_url || oldItem.destUrl,
                        imageUrl: n.image_url || oldItem.imageUrl,
                        price: n.price || oldItem.price,
                        galleryCount: n.gallery_count || oldItem.galleryCount,
                    };
                    
                    let imported = state.stats.imported;
                    let errors = state.stats.errors;
                    
                    if (oldItem.status !== n.status) {
                        if (oldItem.status === 'success') imported--;
                        if (oldItem.status === 'error') errors--;
                        if (n.status === 'success') imported++;
                        if (n.status === 'error') errors++;
                    }
                    
                    const processed = imported + errors;
                    const progress = state.stats.queue ? Math.round((processed / state.stats.queue) * 100) : 0;
                    console.log(`[Realtime] Progress (Update): ${processed}/${state.stats.queue} (${progress}%)`);
                    return {
                        results: newResults,
                        stats: { ...state.stats, imported, errors, progress },
                    };
                }
            });
        }

        const s = get();
        const processedNow = s.stats.imported + s.stats.errors;
        console.log(`[Realtime] Check Completion: ${processedNow} >= ${s.stats.queue}?`);
        if (s.status === 'running' && s.stats.queue > 0 && processedNow >= s.stats.queue) {
          console.log('[Realtime] Task Completed via Realtime!');
          set({ status: 'completed', currentRequestId: null, isLoading: false });
          s.stopRunnerAutoCall();
          try { s.stopLogs(); } catch {}
          try { s.stopResults(); } catch {}

          // Add success log
          const doneLog: LogEntry = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            level: 'success',
            message: `任务完成。成功: ${s.stats.imported}, 失败: ${s.stats.errors}`,
          };
          set((state) => ({ logs: [doneLog, ...state.logs].slice(0, 100) }));
        }
      })
      .subscribe();
    (st as { __resultsChannel?: ReturnType<typeof supabase.channel> }).__resultsChannel = ch;

    // Add polling backup for stats sync (every 3s)
    if ((st as { __statsInterval?: number }).__statsInterval) {
        clearInterval((st as { __statsInterval?: number }).__statsInterval);
    }
    const statsId = window.setInterval(async () => {
        await get().refreshStatus();
        const s = get();
        const processedNow = s.stats.imported + s.stats.errors;
        if (s.status === 'running' && s.stats.queue > 0 && processedNow >= s.stats.queue) {
             console.log('[Polling] Task Completed via Polling!');
             set({ status: 'completed', currentRequestId: null, isLoading: false });
             s.stopRunnerAutoCall();
             try { s.stopLogs(); } catch {}
             try { s.stopResults(); } catch {}
             const doneLog: LogEntry = {
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                level: 'success',
                message: `任务完成 (Polling). 成功: ${s.stats.imported}, 失败: ${s.stats.errors}`,
             };
             set((state) => ({ logs: [doneLog, ...state.logs].slice(0, 100) }));
        }
    }, 3000);
    (st as { __statsInterval?: number }).__statsInterval = statsId as unknown as number;
  },

  fetchUserResults: async (page = 1) => {
    const limit = get().resultsLimit || 10;
    set({ resultsLoading: true, resultsPage: page });
    try {
        const { items, total } = await importApi.getResults(null, page, limit);
        set({ results: items, resultsTotal: total, resultsLoading: false });
    } catch (e) {
        console.error('Fetch user results failed', e);
        set({ resultsLoading: false });
    }
  },

  stopResults: () => {
    const st = get() as unknown as { __resultsChannel?: ReturnType<typeof supabase.channel>; __statsInterval?: number };
    if (st.__resultsChannel) {
      try { supabase.removeChannel(st.__resultsChannel); } catch {}
      (st as { __resultsChannel?: ReturnType<typeof supabase.channel> }).__resultsChannel = undefined;
    }
    if (st.__statsInterval) {
      clearInterval(st.__statsInterval);
      (st as { __statsInterval?: number }).__statsInterval = undefined;
    }
    // Do not clear results here, keep them for display
  },

  startRunnerAutoCall: () => {
    const st = get() as unknown as { __runnerLoopActive?: boolean; __runnerRunning?: boolean; __idleCount?: number };
    if (st.__runnerLoopActive) return;
    (st as { __runnerLoopActive?: boolean }).__runnerLoopActive = true;
    (st as { __idleCount?: number }).__idleCount = 0;
    const token = (process.env.NEXT_PUBLIC_RUNNER_TOKEN || '').trim();

    const loop = async () => {
        // Check if we should continue
        const currentStatus = get().status;
        if (currentStatus !== 'running' && currentStatus !== 'parsing' && currentStatus !== 'stopping') {
           (st as { __runnerLoopActive?: boolean }).__runnerLoopActive = false;
           return;
        }
        if (!(st as { __runnerLoopActive?: boolean }).__runnerLoopActive) return;

        (st as { __runnerRunning?: boolean }).__runnerRunning = true;
        try {
          const url = token ? `/api/import/runner?token=${encodeURIComponent(token)}` : '/api/import/runner';
          let bearer: string | null = null;
          try {
            const { data } = await supabase.auth.getSession();
            bearer = data.session?.access_token || null;
          } catch {}
          const headers: Record<string, string> = {};
          if (bearer) headers['Authorization'] = `Bearer ${bearer}`;

          // Use AbortController for timeout to prevent hanging
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

          let nextDelay = 3000; // Default polling interval

          try {
             const res = await fetch(url, { method: 'GET', headers, signal: controller.signal });
             clearTimeout(timeoutId);

             if (res.ok) {
                const json = await res.json().catch(() => ({}));
                
                if (json && typeof json.processed === 'number' && json.processed > 0) {
                   // Processed items, run again immediately (short delay)
                   (st as { __idleCount?: number }).__idleCount = 0;
                   nextDelay = 100;
                } else {
                   // Idle
                   const idle = ((st as { __idleCount?: number }).__idleCount || 0) + 1;
                   (st as { __idleCount?: number }).__idleCount = idle;
                   
                   // If idle for long time (e.g. 20 * 3s = 60s), check status
                   if (idle >= 20 && get().status === 'running') {
                      await get().refreshStatus();
                      const s = get();
                      // Fallback to fetched if queue is 0
                      const queue = s.stats.queue || s.stats.fetched;
                      const processedNow = s.stats.imported + s.stats.errors;
                      
                      if (queue > 0 && processedNow >= queue) {
                         set({ status: 'completed', currentRequestId: null, isLoading: false });
                         get().stopRunnerAutoCall();
                         try { get().stopLogs(); } catch {}
                         try { get().stopResults(); } catch {}

                         const doneLog: LogEntry = {
                           id: Date.now().toString(),
                           timestamp: new Date().toISOString(),
                           level: 'success',
                           message: `任务完成 (自动检测)。成功: ${s.stats.imported}, 失败: ${s.stats.errors}`,
                         };
                         set((state) => ({ logs: [doneLog, ...state.logs].slice(0, 100) }));
                         // Stop loop
                         return;
                      }
                   }
                }
             } else {
                // Error response
                (st as { __idleCount?: number }).__idleCount = 0;
             }
          } catch (e) {
             // Fetch error
             console.error('Runner loop error:', e);
          }

          // Schedule next loop
          if ((st as { __runnerLoopActive?: boolean }).__runnerLoopActive) {
             setTimeout(loop, nextDelay);
          }

        } catch (e) {
           console.error('Runner loop critical error:', e);
           // Schedule retry even on critical error
           setTimeout(loop, 5000);
        } finally {
           (st as { __runnerRunning?: boolean }).__runnerRunning = false;
        }
    };

    void loop();
  },

  stopRunnerAutoCall: () => {
    const st = get() as unknown as { __runnerLoopActive?: boolean; __runnerInterval?: number };
    (st as { __runnerLoopActive?: boolean }).__runnerLoopActive = false;
    // Clear interval just in case (legacy cleanup)
    if (st.__runnerInterval) {
       try { clearInterval(st.__runnerInterval as unknown as number); } catch {}
       (st as { __runnerInterval?: number }).__runnerInterval = undefined;
    }
  },
}), {
  name: 'import-storage',
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    currentRequestId: state.currentRequestId,
    status: state.status,
    products: state.products,
    logs: state.logs,
    results: state.results,
    stats: state.stats,
    productUrl: state.productUrl,
    listingUrl: state.listingUrl,
  }),
}));
