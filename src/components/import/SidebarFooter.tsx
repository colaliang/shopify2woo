import React from 'react';
import { useUserStore } from '@/stores/userStore';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';

export default function SidebarFooter() {
  const { t } = useTranslation();
  const { openContactModal } = useUserStore();
  
  return (
    <div className="border-t border-gray-200 p-4 bg-white shrink-0">
      <div className="flex flex-row items-center justify-start gap-6">
        <div className="flex flex-col gap-1.5 text-xs text-gray-500">
           <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2">
             <div className="font-medium">{t('footer.copyright', { year: new Date().getFullYear() })}</div>
             <div className="hidden sm:block w-px h-3 bg-gray-300"></div>
             <a 
               href="https://www.ydjia.com" 
               target="_blank" 
               rel="noopener noreferrer"
               className="hover:text-primary-600 hover:underline"
             >
               {t('footer.cloud_store')}
             </a>
             <div className="hidden sm:block w-px h-3 bg-gray-300"></div>
             <a 
               href="/docs/index.html"
               target="_blank"
               className="hover:text-primary-600 hover:underline"
             >
               {t('footer.help')}
             </a>

            <div className="hidden sm:block w-px h-3 bg-gray-300"></div>
             <Link 
               href="/blog"
               className="hover:text-primary-600 hover:underline"
             >
               {t('footer.blog')}
             </Link>

            <div className="hidden sm:block w-px h-3 bg-gray-300"></div>
            <button
              onClick={openContactModal}
              className="hover:text-primary-600 hover:underline text-left"
            >
              {t('footer.contact')}
            </button>
          </div>
           

        </div>
        
      </div>
    </div>
  );
}
