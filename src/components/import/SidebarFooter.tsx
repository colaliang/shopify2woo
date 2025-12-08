import React from 'react';
import { useUserStore } from '@/stores/userStore';

export default function SidebarFooter() {
  const { openContactModal } = useUserStore();
  
  return (
    <div className="border-t border-gray-200 p-4 bg-white shrink-0">
      <div className="flex flex-row items-center justify-start gap-6">
        <div className="flex flex-col gap-1.5 text-xs text-gray-500">
           <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2">
             <div className="font-medium">© {new Date().getFullYear()} 搞跨境的可乐哥</div>
             <div className="hidden sm:block w-px h-3 bg-gray-300"></div>
             <a 
               href="https://www.ydjia.com" 
               target="_blank" 
               rel="noopener noreferrer"
               className="hover:text-primary-600 hover:underline"
             >
               云店+B2B出海营销服务
             </a>
             <div className="hidden sm:block w-px h-3 bg-gray-300"></div>
             <a 
               href="/docs/index.html"
               target="_blank"
               className="hover:text-primary-600 hover:underline"
             >
               帮助
             </a>
             <div className="hidden sm:block w-px h-3 bg-gray-300"></div>
             <a 
              href="mailto:support@ydplus.net"
              className="hover:text-primary-600 hover:underline"
            >
              support@ydplus.net
            </a>
            <div className="hidden sm:block w-px h-3 bg-gray-300"></div>
            <button
              onClick={openContactModal}
              className="hover:text-primary-600 hover:underline text-left"
            >
              联系我们
            </button>
          </div>
           

        </div>
        
      </div>
    </div>
  );
}
