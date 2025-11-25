import { create } from 'zustand';
import { importApi, ProductData, LogEntry, ParseListingRequest } from '@/services/importApi';
import supabase from '@/lib/supabase';
import { useUserStore } from '@/stores/userStore';

export type ImportState = 'idle' | 'parsing' | 'running' | 'stopped' | 'completed' | 'error';

interface ImportStore {
  // State
  status: ImportState;
  products: ProductData[];
  logs: LogEntry[];
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
}

export const useImportStore = create<ImportStore>((set, get) => ({
  // Initial state
  status: 'idle',
  products: [],
  logs: [],
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
    set({ isLoading: true, error: null, status: 'running' });
    try {
      const origin = (() => { try { return new URL(product.link).origin; } catch { return ''; } })();
      const res = await importApi.enqueueWordpress({ sourceUrl: origin, mode: 'links', productLinks: [product.link], cap: 1, priority: 'normal' });
      set({ currentRequestId: res.requestId });
      get().startLogsForRequest(res.requestId);
      set((state) => ({ stats: { ...state.stats, queue: state.stats.queue + 1 } }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'enqueue failed';
      set({ error: msg, status: 'error' });
    } finally {
      set({ isLoading: false });
    }
  },

  // Import selected products
  importSelectedProducts: async () => {
    const { selectedProducts, products } = get();
    if (selectedProducts.size === 0) {
      set({ error: 'No products selected' });
      return;
    }
    const list = products.filter(p => selectedProducts.has(p.id));
    const links = list.map(p => p.link).filter(Boolean);
    set({ isLoading: true, error: null, status: 'running' });
    try {
      const origin = (() => { try { return new URL(list[0].link).origin; } catch { return ''; } })();
      const res = await importApi.enqueueWordpress({ sourceUrl: origin, mode: 'links', productLinks: links, cap: links.length, priority: 'normal' });
      set({ selectedProducts: new Set(), currentRequestId: res.requestId });
      get().startLogsForRequest(res.requestId);
      set((state) => ({ stats: { ...state.stats, queue: links.length } }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'enqueue failed';
      set({ error: msg, status: 'error' });
    } finally {
      set({ isLoading: false });
    }
  },

  // Stop import
  stopImport: async () => {
    try {
      const rid = get().currentRequestId;
      if (rid) {
        await importApi.cancel(rid);
      }
      set({ status: 'stopped', isLoading: false, currentRequestId: null });
      get().stopLogs();

      // Add stopped log
      const stoppedLog: LogEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Import stopped by user',
      };
      
      set((state) => ({
        logs: [stoppedLog, ...state.logs].slice(0, 100),
      }));
    } catch (error) {
      console.error('Failed to stop import:', error);
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
      const status = await importApi.getImportStatus();
      set({
        status: status.status,
        stats: {
          fetched: status.fetched,
          queue: status.queue,
          imported: status.imported,
          errors: status.errors,
          progress: status.progress,
        },
      });
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
    const ch = supabase.channel('import_logs_ui')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'import_logs', ...(uid ? { filter: `user_id=eq.${uid}` } : {}), filter: `request_id=eq.${requestId}` }, (payload) => {
        const n = payload.new as { level: 'info' | 'error'; message: string; created_at: string };
        const item: LogEntry = {
          id: Math.random().toString(36).slice(2),
          timestamp: n.created_at,
          level: n.level === 'error' ? 'error' : 'info',
          message: n.message,
        };
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
    set({ logs: [] });
  },
}));
