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
        return <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />;
      case "warn":
        return <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />;
      case "success":
        return <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />;
      default:
        return <Info className="w-4 h-4 text-blue-500 mt-0.5" />;
    }
  };

  const getContainerClass = () => {
    switch (data.level) {
      case "error":
        return "bg-red-50 border-l-2 border-red-500";
      case "warn":
        return "bg-amber-50 border-l-2 border-amber-500";
      case "success":
        return "bg-green-50 border-l-2 border-green-500";
      default:
        return "hover:bg-gray-50";
    }
  };

  const getTextColor = () => {
    switch (data.level) {
      case "error":
        return "text-red-800";
      case "warn":
        return "text-amber-800";
      case "success":
        return "text-green-800";
      default:
        return "text-gray-700";
    }
  };

  return (
    <div className={`flex items-start gap-2 text-sm p-2 rounded ${getContainerClass()}`}>
      {getIcon()}
      <div className="flex-1 min-w-0">
        <div className={getTextColor()}>
          {data.link ? (
            <a
              href={data.link}
              target="_blank"
              rel="noreferrer"
              className="underline hover:no-underline"
            >
              {data.message}
            </a>
          ) : (
            <span>{data.message}</span>
          )}
        </div>
        <div className={`text-xs mt-1 ${data.level === 'info' ? 'text-gray-400' : 'text-opacity-80 ' + getTextColor()}`}>{time}</div>
      </div>
    </div>
  );
}