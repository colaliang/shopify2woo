export interface LogItemData {
  level: "info" | "warn" | "error" | "success";
  message: string;
  link?: string;
  createdAt?: string;
  timestamp?: string;
}

import { useEffect, useState } from "react";
import LogItem from "./LogItem";

interface RightPanelProps {
  logs: LogItemData[];
  fetched: number;
  queue: number;
  errors: number;
  waitSeconds: number;
  setWaitSeconds: (v: number) => void;
}

export default function RightPanel({
  logs,
  fetched,
  queue,
  errors,
  waitSeconds,
  setWaitSeconds,
}: RightPanelProps) {
  const [open, setOpen] = useState(false);

  // Auto-scroll to bottom on new log
  useEffect(() => {
    const el = document.getElementById("log-scroll");
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

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
        <div id="log-scroll" className="flex-1 overflow-y-auto p-4 space-y-3">
          {logs.map((log, i) => (
            <LogItem key={i} data={log} />
          ))}
        </div>
      </aside>

      {/* Mobile bottom sheet trigger */}
      <div className="md:hidden fixed bottom-4 right-4 z-20">
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-full shadow"
        >
          日志 ({logs.length})
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
              {logs.map((log, i) => (
                <LogItem key={i} data={log} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}