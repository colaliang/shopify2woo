import { ExternalLink, Package } from "lucide-react";
import Image from "next/image";

export interface ProductItemData {
  id: string;
  title: string;
  link: string;
  thumbnail?: string;
  price: string;
  attributesCount: number;
  reviewsCount: number;
  galleryCount: number;
  inStock: boolean;
  categoryBreadcrumbs?: string;
  sourceDomain?: string;
}

interface ProductItemProps {
  data: ProductItemData;
  selected: boolean;
  onSelect: () => void;
  onImport: () => void;
  importing?: boolean;
}

export default function ProductItem({
  data,
  selected,
  onSelect,
  onImport,
  importing = false,
}: ProductItemProps) {
  return (
    <div className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg bg-white hover:shadow-sm">
      <input
        type="checkbox"
        checked={selected}
        onChange={onSelect}
        className="h-4 w-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
      />
      <Image
        src={data.thumbnail || "https://via.placeholder.com/64"}
        alt={data.title}
        width={64}
        height={64}
        className="object-cover rounded"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <a
            href={data.link}
            target="_blank"
            rel="noreferrer"
            className="text-primary-600 hover:underline font-medium truncate"
          >
            {data.title}
          </a>
          <ExternalLink className="w-3 h-3 text-gray-400" />
        </div>
        <div className="text-xs text-gray-500 mt-1">{data.categoryBreadcrumbs}</div>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          <span>属性: {data.attributesCount}</span>
          <span>评价: {data.reviewsCount}</span>
          <span>图片: {data.galleryCount}</span>
          {data.inStock ? (
            <span className="text-green-600 font-medium">有库存</span>
          ) : (
            <span className="text-red-600 font-medium">缺货</span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
          <Package className="w-3 h-3" />
          <span>{data.sourceDomain}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-semibold text-gray-900">{data.price}</div>
        <button
          onClick={onImport}
          disabled={importing}
          className="mt-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {importing ? "导入中..." : "导入商品"}
        </button>
      </div>
    </div>
  );
}