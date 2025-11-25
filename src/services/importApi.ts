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
    try {
      const response = await fetch(`${this.baseUrl}/status`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get import status:', error);
      // Return default status on error
      return {
        status: 'idle',
        fetched: 0,
        queue: 0,
        imported: 0,
        errors: 0,
        progress: 0,
      };
    }
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
      const response = await fetch(`${this.baseUrl}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const response = await fetch(`${this.baseUrl}/wordpress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
}

export const importApi = new ImportApiService();
