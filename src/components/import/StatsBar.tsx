interface StatsBarProps {
  imported: number;
  queue: number;
  errors: number;
  total: number;
}

export default function StatsBar({ imported, queue, errors, total }: StatsBarProps) {
  const percent = total ? Math.round((imported / total) * 100) : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4">
      <div className="flex-1">
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <div className="text-sm text-gray-700 whitespace-nowrap">
        Imported: {imported} / In queue: {queue} / Errors: {errors}
      </div>
    </div>
  );
}