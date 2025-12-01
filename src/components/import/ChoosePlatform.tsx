import React from 'react';
import { Check } from 'lucide-react';
import Image from 'next/image';

export type PlatformType = 'wordpress' | 'wix' | 'shopify';

interface ChoosePlatformProps {
  selected: PlatformType;
  onSelect: (p: PlatformType) => void;
  disabled?: boolean;
}

export default function ChoosePlatform({ selected, onSelect, disabled }: ChoosePlatformProps) {
  const platforms: { id: PlatformType; name: string; logo: string }[] = [
    { id: 'wordpress', name: 'Wordpress', logo: '/wordpress.png' },
    { id: 'shopify', name: 'Shopify', logo: '/shopify.png' },
    { id: 'wix', name: 'Wix', logo: '/wix.png' },
  ];

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      {platforms.map((p) => (
        <div
          key={p.id}
          onClick={() => !disabled && onSelect(p.id)}
          className={`
            relative flex flex-col items-center justify-center h-32 border-2 rounded-lg cursor-pointer transition-all overflow-hidden
            ${selected === p.id 
              ? 'border-red-500 bg-red-50' 
              : 'border-gray-200 hover:border-red-200 bg-white'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <div className="relative w-full h-full">
            <Image 
              src={p.logo} 
              alt={p.name} 
              fill 
              className="object-contain"
            />
          </div>
          {/* <span className={`font-semibold text-sm ${selected === p.id ? 'text-red-600' : 'text-gray-700'}`}>
            {p.name}
          </span> */}
          
          {selected === p.id && (
            <div className="absolute top-2 right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center shadow-sm">
               <Check className="w-3 h-3 text-white" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
