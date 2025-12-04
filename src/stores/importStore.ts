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
  results: Array<{ id: string; timestamp: string; status: 'success' | 'error'; message?: string; name?: string; productId?: string; itemKey?: string }>;
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
  
  // Actions
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
}

export const useImportStore = create<ImportStore>()(persist((set, get) => ({
  // Initial state
  status: 'idle',
  products: [],
  logs: [],
  results: [],
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
    try {
      const rid = get().currentRequestId;
      if (rid) {
        await importApi.cancel(rid);
      }
      
      // Poll for queue empty
      if (rid) {
        for (let i = 0; i < 30; i++) {
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

      set({ status: 'stopped', isLoading: false, currentRequestId: null });
      get().stopLogs();
      get().stopResults();
      get().stopRunnerAutoCall();
      await get().refreshStatus();

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
    } catch (error) {
      console.error('Failed to stop import:', error);
      // Force stop UI even if API fails
      set({ status: 'stopped', isLoading: false, currentRequestId: null });
      get().stopLogs();
      get().stopResults();
      get().stopRunnerAutoCall();
      await get().refreshStatus();
    }
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
      const imported = typeof qs.counts?.imported === 'number' ? qs.counts!.imported : s.stats.imported;
      const errors = typeof qs.counts?.errors === 'number' ? qs.counts!.errors : s.stats.errors;
      const processed = imported + errors;
      let queue = s.stats.queue;
      if (qs && qs.queueEmptyForRequest === true) {
        queue = processed;
      }
      const progress = queue ? Math.round((processed / queue) * 100) : 0;
      set({ stats: { ...s.stats, queue, imported, errors, progress } });
      if (s.status === 'running' && qs && qs.queueEmptyForRequest === true) {
        set({ status: 'completed', currentRequestId: null, isLoading: false });
        get().stopRunnerAutoCall();
        try { get().stopLogs(); } catch {}
        try { get().stopResults(); } catch {}

        // Add success log
        const doneLog: LogEntry = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          level: 'success',
          message: `任务完成 (队列已空)。成功: ${imported}, 失败: ${errors}`,
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

  startResultsForRequest: (requestId: string, clear = true) => {
    if (clear) set({ results: [] });

    // Fetch existing results
    importApi.getResults(requestId).then(items => {
       set(state => {
         // If we cleared, just set. If not, append unique.
         // Actually, getResults might return overlap.
         const existingKeys = new Set(state.results.map(r => r.itemKey));
         const newItems = items.filter(i => !existingKeys.has(i.itemKey));
         // Sort by timestamp descending if needed? API returns desc.
         // We append new items? Or prepend? 
         // API returns descending (newest first).
         // Existing results (if not cleared) might be old or new?
         // If we merge, we should probably re-sort.
         const merged = [...state.results, ...newItems].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
         return { results: merged };
       });
    });

    const st = get() as unknown as { __resultsChannel?: ReturnType<typeof supabase.channel> };
    if (st.__resultsChannel) {
      try { supabase.removeChannel(st.__resultsChannel); } catch {}
    }
    const uid = useUserStore.getState().user?.id || '';
    const ch = supabase.channel('import_results')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'import_results', ...(uid ? { filter: `user_id=eq.${uid}` } : {}), filter: `request_id=eq.${requestId}` }, (payload) => {
        const n = payload.new as { status: 'success' | 'error'; message?: string; name?: string; product_id?: string; item_key?: string; created_at: string };
        
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
            };
            set((state) => {
              const imported = state.stats.imported + (n.status === 'success' ? 1 : 0);
              const errors = state.stats.errors + (n.status === 'error' ? 1 : 0);
              const processed = imported + errors;
              const progress = state.stats.queue ? Math.round((processed / state.stats.queue) * 100) : 0;
              return {
                results: [item, ...state.results].slice(0, 200),
                stats: { ...state.stats, imported, errors, progress },
              };
            });
        } else if (payload.eventType === 'UPDATE') {
            set((state) => {
                const existingIdx = state.results.findIndex(r => r.itemKey === n.item_key);
                if (existingIdx === -1) {
                    // Treat as insert if not found (shouldn't happen often if synced)
                    const item = {
                        id: Math.random().toString(36).slice(2),
                        timestamp: n.created_at,
                        status: n.status,
                        message: n.message,
                        name: n.name,
                        productId: n.product_id,
                        itemKey: n.item_key,
                    };
                    const imported = state.stats.imported + (n.status === 'success' ? 1 : 0);
                    const errors = state.stats.errors + (n.status === 'error' ? 1 : 0);
                    const processed = imported + errors;
                    const progress = state.stats.queue ? Math.round((processed / state.stats.queue) * 100) : 0;
                    return {
                        results: [item, ...state.results].slice(0, 200),
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
                    return {
                        results: newResults,
                        stats: { ...state.stats, imported, errors, progress },
                    };
                }
            });
        }

        const s = get();
        const processedNow = s.stats.imported + s.stats.errors;
        if (s.status === 'running' && s.stats.queue > 0 && processedNow >= s.stats.queue) {
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
  },

  stopResults: () => {
    const st = get() as unknown as { __resultsChannel?: ReturnType<typeof supabase.channel> };
    if (st.__resultsChannel) {
      try { supabase.removeChannel(st.__resultsChannel); } catch {}
      (st as { __resultsChannel?: ReturnType<typeof supabase.channel> }).__resultsChannel = undefined;
    }
    // Do not clear results here, keep them for display
  },

  startRunnerAutoCall: () => {
    const st = get() as unknown as { __runnerInterval?: number; __runnerRunning?: boolean; __idleCount?: number };
    if (st.__runnerInterval) return;
    const token = (process.env.NEXT_PUBLIC_RUNNER_TOKEN || '').trim();
    st.__idleCount = 0; // Reset idle count
    
    const call = async () => {
      if ((get() as unknown as { __runnerRunning?: boolean }).__runnerRunning) return;
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
        const res = await fetch(url, { method: 'GET', headers });
        
        // Auto-stop logic if runner is idle for too long
        if (res.ok) {
           const json = await res.json().catch(() => ({}));
           // If processed is explicitly 0, we count it as an idle cycle
           if (json && typeof json.processed === 'number' && json.processed === 0) {
             const idle = (st.__idleCount || 0) + 1;
             st.__idleCount = idle;
             // If we have been idle for 6 cycles (60 seconds) and we are still 'running',
             // and we haven't received updates, maybe we should stop?
             // However, for large files, processing might take time without returning 'processed'.
             // But usually 'processed' means "completed items".
             // Let's be conservative: 6 cycles = 1 minute of doing nothing.
             if (idle >= 6 && get().status === 'running') {
                // Try to refresh status from server to double check
                await get().refreshStatus();
                const s = get();
                const processedNow = s.stats.imported + s.stats.errors;
                if (processedNow >= s.stats.queue) {
                   set({ status: 'completed', currentRequestId: null, isLoading: false });
                   get().stopRunnerAutoCall();
                   try { get().stopLogs(); } catch {}
                   try { get().stopResults(); } catch {}

                   // Add success log
                   const doneLog: LogEntry = {
                     id: Date.now().toString(),
                     timestamp: new Date().toISOString(),
                     level: 'success',
                     message: `任务完成 (自动检测)。成功: ${s.stats.imported}, 失败: ${s.stats.errors}`,
                   };
                   set((state) => ({ logs: [doneLog, ...state.logs].slice(0, 100) }));
                }
             }
           } else {
             st.__idleCount = 0;
           }
        }
      } catch {}
      (st as { __runnerRunning?: boolean }).__runnerRunning = false;
    };
    const id = window.setInterval(call, 10000);
    (st as { __runnerInterval?: number }).__runnerInterval = id as unknown as number;
    void call();
  },

  stopRunnerAutoCall: () => {
    const st = get() as unknown as { __runnerInterval?: number };
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
  }),
}));
