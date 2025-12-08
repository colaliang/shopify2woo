import React from 'react';

export default function SidebarFooter() {
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
               href="mailto:support@ydjia.com"
               className="hover:text-primary-600 hover:underline"
             >
               support@ydjia.com
             </a>
           </div>
           

        </div>
        
      </div>
    </div>
  );
}
