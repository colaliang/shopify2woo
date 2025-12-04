import { Search } from "lucide-react";

interface URLInputCardProps {
  value: string;
  onChange: (v: string) => void;
  onExtract: (url: string) => void;
  loading?: boolean;
  disabled?: boolean;
}

export default function URLInputCard({
  value,
  onChange,
  onExtract,
  loading = false,
  disabled = false,
}: URLInputCardProps) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        商品链接地址（支持多个，逗号/空格/换行分隔）
      </label>
      <div className="flex items-start gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://www.example.com/product/a, https://www.example.com/product/b\n或每行一个链接"
            rows={3}
            disabled={disabled}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg bg-white shadow-sm focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>
        <button
          onClick={() => onExtract(value)}
          disabled={loading || !value || disabled}
          className="h-9 px-3 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {loading || disabled ? "导入中..." : "导入"}
        </button>
      </div>
    </div>
  );
}
