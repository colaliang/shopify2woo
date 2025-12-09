import { useTranslation } from "react-i18next";

interface OptionsRowProps {
  defaultCategory: string;
  setDefaultCategory: (v: string) => void;
  threads: number;
  setThreads: (v: number) => void;
  autoPagination: boolean;
  setAutoPagination: (v: boolean) => void;
  disabled?: boolean;
}

export default function OptionsRow({
  defaultCategory,
  setDefaultCategory,
  threads,
  setThreads,
  autoPagination,
  setAutoPagination,
  disabled = false,
}: OptionsRowProps) {
  const { t } = useTranslation();
  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-4 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('import.options.default_category')}</label>
        <select
          value={defaultCategory}
          onChange={(e) => setDefaultCategory(e.target.value)}
          disabled={disabled}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        >
          <option value="">{t('import.options.uncategorized')}</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('import.options.threads')}</label>
        <input
          type="number"
          min={1}
          max={50}
          value={threads}
          onChange={(e) => setThreads(Number(e.target.value))}
          disabled={disabled}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="autoPagination"
          type="checkbox"
          checked={autoPagination}
          onChange={(e) => setAutoPagination(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:text-gray-400"
        />
        <label htmlFor="autoPagination" className="text-sm font-medium text-gray-700">
          {t('import.options.auto_pagination')}
        </label>
      </div>
    </div>
  );
}