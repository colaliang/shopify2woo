import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  disabled = false,
}: URLInputCardProps) {
  const { t } = useTranslation();
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {t('import.url_input.label')}
      </label>
      <div className="flex items-start gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('import.url_input.placeholder')}
            rows={3}
            disabled={disabled}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg bg-white shadow-sm focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>
      </div>
    </div>
  );
}
