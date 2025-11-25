interface OptionsRowProps {
  defaultCategory: string;
  setDefaultCategory: (v: string) => void;
  threads: number;
  setThreads: (v: number) => void;
  autoPagination: boolean;
  setAutoPagination: (v: boolean) => void;
}

export default function OptionsRow({
  defaultCategory,
  setDefaultCategory,
  threads,
  setThreads,
  autoPagination,
  setAutoPagination,
}: OptionsRowProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Default category</label>
        <select
          value={defaultCategory}
          onChange={(e) => setDefaultCategory(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Uncategorized</option>
          <option value="led-lights">LED Lights</option>
          <option value="profiles">Aluminium Profiles</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Import threads</label>
        <input
          type="number"
          min={1}
          max={50}
          value={threads}
          onChange={(e) => setThreads(Number(e.target.value))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="autoPagination"
          type="checkbox"
          checked={autoPagination}
          onChange={(e) => setAutoPagination(e.target.checked)}
          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        <label htmlFor="autoPagination" className="text-sm font-medium text-gray-700">
          Automatic pagination
        </label>
      </div>
    </div>
  );
}