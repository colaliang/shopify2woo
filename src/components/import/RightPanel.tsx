export interface LogItemData {
  level: "info" | "warn" | "error" | "success";
  message: string;
  link?: string;
  createdAt?: string;
  timestamp?: string;
}

import { useState } from "react";

interface RightPanelProps {
  logs: LogItemData[];
  fetched: number;
  queue: number;
  imported?: number;
  errors: number;
  status?: 'idle' | 'parsing' | 'running' | 'stopped' | 'completed' | 'error';
  waitSeconds: number;
  setWaitSeconds: (v: number) => void;
}

export default function RightPanel({
  fetched,
  queue,
  imported = 0,
  errors,
  status = 'idle',
  waitSeconds,
  setWaitSeconds,
}: RightPanelProps) {
  const [open, setOpen] = useState(false);

  const summaryLines = (() => {
    const out: Array<{ text: string; level: 'info' | 'success' | 'error' }> = [];
    if (status === 'running' || status === 'parsing') out.push({ text: '任务开始', level: 'info' });
    if (status === 'completed') out.push({ text: '任务结束', level: 'success' });
    if (status === 'stopped') out.push({ text: '任务已停止', level: 'info' });
    if (status === 'error') out.push({ text: '任务异常', level: 'error' });
    out.push({ text: `导入成功 ${imported}`, level: 'success' });
    out.push({ text: `导入失败 ${errors}`, level: 'error' });
    return out;
  })();

  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex w-full md:w-1/3 lg:w-1/4 h-[calc(100vh-64px)] flex-col border-l border-gray-200 bg-gray-50">
        <div className="p-4 border-b border-gray-200">
          <div className="text-sm text-gray-700">
            已获取: {fetched} | 队列: {queue} | 错误: {errors}
          </div>
          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-600">执行等待时间 (秒)</label>
            <input
              type="number"
              min={0}
              max={60}
              value={waitSeconds}
              onChange={(e) => setWaitSeconds(Number(e.target.value))}
              className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {summaryLines.map((l, i) => (
            <div key={i} className={
              "text-sm px-3 py-2 rounded border " +
              (l.level === 'success' ? 'bg-green-50 border-green-200 text-green-700' : l.level === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-800')
            }>{l.text}</div>
          ))}
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
              已获取: {fetched} | 队列: {queue} | 错误: {errors}
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {summaryLines.map((l, i) => (
                <div key={i} className={
                  "text-sm px-3 py-2 rounded border " +
                  (l.level === 'success' ? 'bg-green-50 border-green-200 text-green-700' : l.level === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-800')
                }>{l.text}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
