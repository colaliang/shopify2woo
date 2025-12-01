export interface ImportStatus {
  status: 'idle' | 'parsing' | 'running' | 'stopped' | 'completed' | 'error';
  fetched: number;
  queue: number;
  imported: number;
  errors: number;
  progress: number;
}

export interface ProductData {
  id: string;
  title: string;
  link: string;
  thumbnail: string;
  price: string;
  attributesCount: number;
  reviewsCount: number;
  galleryCount: number;
  inStock: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  details?: unknown;
}

export interface ParseListingRequest {
  url: string;
  options?: {
    limit?: number;
    includeVariants?: boolean;
    includeReviews?: boolean;
  };
}

export interface ImportProductRequest {
  productId: string;
  options?: {
    includeVariants?: boolean;
    includeReviews?: boolean;
    includeGallery?: boolean;
  };
}

import supabase from '@/lib/supabase';

class ImportApiService {
  private baseUrl = '/api/import';

  async parseListing(request: ParseListingRequest): Promise<{ products: ProductData[] }> {
    try {
      const response = await fetch(`${this.baseUrl}/parseListing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to parse listing:', error);
      throw error;
    }
  }

  async importProduct(request: ImportProductRequest): Promise<{ success: boolean; productId: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/runner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to import product:', error);
      throw error;
    }
  }

  async getImportStatus(): Promise<ImportStatus> {
    // Deprecated: prefer getQueueStats, keeping for compatibility
    return {
      status: 'idle',
      fetched: 0,
      queue: 0,
      imported: 0,
      errors: 0,
      progress: 0,
    };
  }

  async getQueueStats(requestId?: string): Promise<{ warn: boolean; rows: { queue: string; ready: number | null; vt: number | null; total: number | null; archived: number | null }[]; queueEmptyForRequest?: boolean; thresholds?: { warn: number }; reasons?: string[]; counts?: { imported: number; errors: number; partial: number; processed: number } }> {
    const url = requestId ? `${this.baseUrl}/queue/stats?requestId=${encodeURIComponent(requestId)}` : `${this.baseUrl}/queue/stats`;
    const res = await fetch(url);
    const j = await res.json().catch(() => ({ warn: false, rows: [] }));
    return j as { warn: boolean; rows: { queue: string; ready: number | null; vt: number | null; total: number | null; archived: number | null }[]; queueEmptyForRequest?: boolean; thresholds?: { warn: number }; reasons?: string[]; counts?: { imported: number; errors: number; partial: number; processed: number } };
  }

  async getLogs(limit: number = 100): Promise<LogEntry[]> {
    try {
      const response = await fetch(`${this.baseUrl}/logs?limit=${limit}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get logs:', error);
      return [];
    }
  }

  async getResults(requestId: string, limit: number = 200): Promise<Array<{ id: string; timestamp: string; status: 'success' | 'error'; message?: string; name?: string; productId?: string; itemKey?: string }>> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || '';
      const response = await fetch(`${this.baseUrl}/history?requestId=${encodeURIComponent(requestId)}&limit=${limit}`, {
         headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!response.ok) return [];
      const j = await response.json();
      return (j.items || []).map((i: any) => ({
        id: i.id || i.itemKey || Math.random().toString(36).slice(2),
        timestamp: i.createdAt || i.timestamp,
        status: i.status,
        message: i.message,
        name: i.name,
        productId: i.productId,
        itemKey: i.itemKey
      }));
    } catch (error) {
      console.error('Failed to get results:', error);
      return [];
    }
  }

  async stopImport(): Promise<{ success: boolean }> {
    try {
      const response = await fetch(`${this.baseUrl}/stop`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to stop import:', error);
      throw error;
    }
  }

  async cancel(requestId: string): Promise<{ ok: boolean; removed: number }> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || '';
      const response = await fetch(`${this.baseUrl}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ requestId }),
      });
      const j = await response.json().catch(()=>null);
      if (!response.ok || !j) {
        const msg = (j && typeof j.error === 'string') ? j.error : `HTTP ${response.status}`;
        throw new Error(msg);
      }
      return j as { ok: boolean; removed: number };
    } catch (error) {
      console.error('Failed to cancel import:', error);
      throw error;
    }
  }

  async enqueueWordpress(params: { sourceUrl: string; mode: 'all' | 'links'; productLinks?: string[]; cap?: number; priority?: 'normal' | 'high' }): Promise<{ success: boolean; requestId: string; count: number }> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || '';
      const response = await fetch(`${this.baseUrl}/wordpress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(params),
      });
      if (!response.ok) {
        const j = await response.json().catch(()=>null);
        const msg = (j && typeof j.error === 'string') ? j.error : `HTTP ${response.status}`;
        throw new Error(msg);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to enqueue wordpress:', error);
      throw error;
    }
  }

  async enqueueShopify(params: { shopifyBaseUrl: string; mode: 'all' | 'links'; productLinks?: string[]; cap?: number; categories?: string[]; tags?: string[] }): Promise<{ success: boolean; requestId: string; count: number }> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || '';
      const response = await fetch(`${this.baseUrl}/shopify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(params),
      });
      if (!response.ok) {
        const j = await response.json().catch(()=>null);
        const msg = (j && typeof j.error === 'string') ? j.error : `HTTP ${response.status}`;
        throw new Error(msg);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to enqueue shopify:', error);
      throw error;
    }
  }

  async enqueueWix(params: { sourceUrl: string; mode: 'all' | 'links'; productLinks?: string[]; cap?: number }): Promise<{ success: boolean; requestId: string; count: number }> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token || '';
      const response = await fetch(`${this.baseUrl}/wix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(params),
      });
      if (!response.ok) {
        const j = await response.json().catch(()=>null);
        const msg = (j && typeof j.error === 'string') ? j.error : `HTTP ${response.status}`;
        throw new Error(msg);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to enqueue wix:', error);
      throw error;
    }
  }
}

export const importApi = new ImportApiService();
