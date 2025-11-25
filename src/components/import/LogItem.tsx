import { CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";

export interface LogItemData {
  level: "info" | "warn" | "error" | "success";
  message: string;
  link?: string;
  createdAt?: string;
  timestamp?: string;
}

interface LogItemProps {
  data: LogItemData;
}

export default function LogItem({ data }: LogItemProps) {
  const timeStr = data.createdAt || data.timestamp || new Date().toISOString();
  const time = new Date(timeStr).toLocaleTimeString();

  const getIcon = () => {
    switch (data.level) {
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />;
      case "warn":
        return <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5" />;
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />;
      default:
        return <Info className="w-4 h-4 text-blue-500 mt-0.5" />;
    }
  };

  return (
    <div className="flex items-start gap-2 text-sm">
      {getIcon()}
      <div className="flex-1 min-w-0">
        <div className="text-gray-700">
          {data.link ? (
            <a
              href={data.link}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:underline"
            >
              {data.message}
            </a>
          ) : (
            <span>{data.message}</span>
          )}
        </div>
        <div className="text-xs text-gray-400 mt-1">{time}</div>
      </div>
    </div>
  );
}