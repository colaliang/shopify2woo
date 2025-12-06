import { useState } from "react";
import { ProductData } from "@/services/importApi";

export interface LogItemData {
  level: "info" | "warn" | "error" | "success";
  message: string;
  link?: string;
  createdAt?: string;
  timestamp?: string;
}

export interface ResultItemData {
  id: string;
  timestamp: string;
  status: 'success' | 'error';
  message?: string;
  name?: string;
  productId?: string;
  itemKey?: string;
  destUrl?: string;
  imageUrl?: string;
  price?: string;
  galleryCount?: number;
  requestId?: string;
}

interface RightPanelProps {
  logs: LogItemData[];
  results?: ResultItemData[];
  products?: ProductData[];
  fetched: number;
  queue: number;
  imported?: number;
  errors: number;
  status?: 'idle' | 'parsing' | 'running' | 'stopped' | 'stopping' | 'completed' | 'error';
  waitSeconds: number;
  setWaitSeconds: (v: number) => void;
  page?: number;
  total?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
  resultsLoading?: boolean;
}

export default function RightPanel({
  fetched,
  queue,
  imported = 0,
  errors,
  status = 'idle',
  results = [],
  products = [],
  page = 1,
  total = 0,
  limit = 10,
  onPageChange,
  resultsLoading = false,
  // waitSeconds,
  // setWaitSeconds,
}: RightPanelProps) {
  const [open, setOpen] = useState(false);

  const totalPages = Math.ceil(total / limit);

  const summaryLines = (() => {
    const out: Array<{ text: string; level: 'info' | 'success' | 'error' }> = [];
    if (status === 'running' || status === 'parsing') out.push({ text: '任务开始', level: 'info' });
    if (status === 'completed') out.push({ text: '任务结束', level: 'success' });
    if (status === 'stopping') out.push({ text: '正在停止...', level: 'info' });
    if (status === 'stopped') out.push({ text: '任务已停止', level: 'info' });
    if (status === 'error') out.push({ text: '任务异常', level: 'error' });

    return out;
  })();

  const renderResultItem = (res: ResultItemData) => {
    const product = products.find(p => p.link === res.itemKey || p.id === res.itemKey);
    const title = res.name || product?.title || res.itemKey || "Unknown Product";
    const thumb = res.imageUrl || product?.thumbnail;
    // Use product data if available, otherwise defaults
    const galCount = res.galleryCount ?? product?.galleryCount ?? 0;
    // const type = product?.type || 'simple';
    const salePrice = res.price || product?.salePrice || product?.price || '0';
    const primaryCat = product?.primaryCategory || product?.categoryBreadcrumbs?.split('>')[0]?.trim() || 'Uncategorized';
    const sourceUrl = product?.link || (res.itemKey?.startsWith('http') ? res.itemKey : '');
    const updateTime = res.timestamp ? new Date(res.timestamp).toLocaleString() : '';

    return (
      <div key={res.id} className="flex gap-3 p-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
        {/* Thumbnail */}
        <div className="w-16 h-16 flex-shrink-0 bg-gray-100 rounded overflow-hidden relative">
           {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt={title} className="w-full h-full object-cover" />
            ) : (
             <div className="w-full h-full flex items-center justify-center text-gray-300">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
             </div>
           )}
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-start justify-between gap-2">
             <h4 className="text-sm font-bold text-gray-900 truncate" title={title}>{title}</h4>
             {res.status === 'success' ? (
               <span className="text-xs text-green-600 font-medium bg-green-50 px-1.5 py-0.5 rounded flex-shrink-0">Success</span>
             ) : (
               <span className="text-xs text-red-600 font-medium bg-red-50 px-1.5 py-0.5 rounded flex-shrink-0">Error</span>
             )}
          </div>
          
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-gray-500 mt-1.5">
            <span className="whitespace-nowrap" title={res.requestId}>ID: {res.requestId?.slice(0, 8) || '-'}</span>
            <span className="text-gray-300">|</span>
            <span className="whitespace-nowrap">Price: {salePrice}</span>
            <span className="text-gray-300">|</span>
            <span className="whitespace-nowrap">Images: {galCount}</span>
            <span className="text-gray-300">|</span>
            <span className="whitespace-nowrap truncate max-w-[80px]" title={primaryCat}>
              {primaryCat}
            </span>
            {sourceUrl && (
              <>
                <span className="text-gray-300">|</span>
                <a 
                  href={sourceUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap hover:underline"
                >
                  Source
                </a>
              </>
            )}
            {res.destUrl && (
              <>
                <span className="text-gray-300">|</span>
                <a 
                  href={res.destUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-primary-600 hover:text-primary-700 font-medium whitespace-nowrap hover:underline"
                >
                  View
                </a>
              </>
            )}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5" title="Update Time">
            {updateTime}
          </div>
          {res.message && res.status === 'error' && (
            <div className="text-[10px] text-red-500 mt-1 truncate" title={res.message}>{res.message}</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex w-full md:w-1/3 lg:w-1/4 h-full flex-col border-l border-gray-200 bg-gray-50">
        {/* Logs Header */}
        <div className="px-4 py-3 border-b border-gray-200 bg-white shrink-0 space-y-3">
          {status === 'idle' ? (
            <div className="text-sm text-gray-500 text-center py-1">任务未开始</div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>已获取: <span className="font-medium text-gray-900">{fetched}</span></span>
                <span className="text-gray-300">|</span>
                <span>成功: <span className="font-medium text-green-600">{imported}</span></span>
                <span className="text-gray-300">|</span>
                <span>队列: <span className="font-medium text-gray-900">{queue}</span></span>
                <span className="text-gray-300">|</span>
                <span>错误: <span className="font-medium text-red-600">{errors}</span></span>
              </div>
              
              <div className="relative w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                 <div 
                   className={`absolute left-0 top-0 h-full transition-all duration-500 ${
                     status === 'completed' ? 'bg-green-500' : 
                     status === 'error' ? 'bg-red-500' : 
                     'bg-primary-600'
                   }`}
                   style={{ width: `${Math.min(100, Math.max(0, queue > 0 ? ((imported + errors) / queue) * 100 : 0))}%` }}
                 />
              </div>
              
              <div className="flex justify-between text-xs text-gray-500">
                 <span>
                    {status === 'parsing' && '正在解析...'}
                    {status === 'running' && '正在导入...'}
                    {status === 'stopping' && '正在停止...'}
                    {status === 'stopped' && '已停止'}
                    {status === 'completed' && '任务完成'}
                    {status === 'error' && '任务异常'}
                 </span>
                 <span>
                   {queue > 0 ? Math.round(((imported + errors) / queue) * 100) : 0}%
                 </span>
              </div>
            </>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          
          {/* Results List */}
          {results.length > 0 && (
            <div className="pt-2 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Results ({total})</div>
                {resultsLoading && <div className="text-xs text-gray-400">Loading...</div>}
              </div>
              {results.map(res => renderResultItem(res))}
              
              {/* Pagination */}
              {totalPages > 1 && onPageChange && (
                <div className="flex items-center justify-between pt-2 text-xs">
                  <button 
                    onClick={() => onPageChange(page - 1)}
                    disabled={page <= 1 || resultsLoading}
                    className="px-2 py-1 bg-white border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50"
                  >
                    Prev
                  </button>
                  <span className="text-gray-600">
                    {page} / {totalPages}
                  </span>
                  <button 
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= totalPages || resultsLoading}
                    className="px-2 py-1 bg-white border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Mobile bottom sheet trigger */}
      <div className="md:hidden fixed bottom-4 right-4 z-20">
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-full shadow"
        >
          概要
        </button>
      </div>

      {/* Mobile sheet */}
      {open && (
        <div className="md:hidden fixed inset-0 z-30 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative w-full h-2/3 bg-white rounded-t-2xl p-4 flex flex-col">
            <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-3" />
            <div className="text-sm text-gray-700 mb-2">
              已获取: {fetched} | 成功: {imported} | 队列: {queue} | 错误: {errors}
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {summaryLines.map((l, i) => (
                <div key={i} className={
                  "text-sm px-3 py-2 rounded border " +
                  (l.level === 'success' ? 'bg-green-50 border-green-200 text-green-700' : l.level === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-800')
                }>{l.text}</div>
              ))}
              
              {/* Results List Mobile */}
              {results.length > 0 && (
                <div className="pt-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Results ({total})</div>
                    {resultsLoading && <div className="text-xs text-gray-400">Loading...</div>}
                  </div>
                  {results.map(res => renderResultItem(res))}

                  {/* Pagination Mobile */}
                  {totalPages > 1 && onPageChange && (
                    <div className="flex items-center justify-between pt-2 pb-4 text-xs">
                      <button 
                        onClick={() => onPageChange(page - 1)}
                        disabled={page <= 1 || resultsLoading}
                        className="px-3 py-2 bg-white border border-gray-300 rounded disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <span className="text-gray-600">
                        {page} / {totalPages}
                      </span>
                      <button 
                        onClick={() => onPageChange(page + 1)}
                        disabled={page >= totalPages || resultsLoading}
                        className="px-3 py-2 bg-white border border-gray-300 rounded disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
