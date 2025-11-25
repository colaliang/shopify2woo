import { X } from "lucide-react";
import { useUserStore } from "@/stores/userStore";

export default function DebugModal() {
  const { debugModalOpen, closeDebugModal } = useUserStore();
  if (!debugModalOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={closeDebugModal} />
      <div className="relative bg-white rounded-lg shadow-xl w-full md:w-[1000px] max-w-[1000px] mx-4 overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b border-gray-200">
          <div className="text-sm font-medium text-gray-700">调试窗口</div>
          <button onClick={closeDebugModal} className="p-2 hover:bg-gray-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="w-full h-[70vh]">
          <iframe title="debug" src="/debug/scrape" className="w-full h-full border-0" />
        </div>
      </div>
    </div>
  );
}