import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SiteInputCardProps {
  value: string;
  onChange: (v: string) => void;
  onDiscover: (siteUrl: string) => void;
  loading?: boolean;
  disabled?: boolean;
}

export default function SiteInputCard({
  value,
  onChange,
  onDiscover,
  loading = false,
  disabled = false,
}: SiteInputCardProps) {
  const { t } = useTranslation();
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">{t('import.site_input.label')}</label>
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('import.site_input.placeholder')}
            disabled={disabled}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg bg-white shadow-sm focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>
        <button
          onClick={() => onDiscover(value)}
          disabled={loading || !value || disabled}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading || disabled ? t('import.site_input.btn_loading') : t('import.site_input.btn_discover')}
        </button>
      </div>
    </div>
  );
}

