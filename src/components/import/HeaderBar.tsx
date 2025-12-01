import { Settings, User, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useUserStore } from "@/stores/userStore";
import LoginModal from "@/components/auth/LoginModal";
import SettingsModal from "@/components/auth/SettingsModal";
import DebugPanel from "@/components/auth/DebugPanel";

interface HeaderBarProps {
  activeTab: "listing" | "product";
  onTabChange: (tab: "listing" | "product") => void;
}

export default function HeaderBar({ activeTab, onTabChange }: HeaderBarProps) {
  const [open, setOpen] = useState(false);
  const { user, isAuthenticated, openLoginModal, openSettingsModal, logout, initFromSupabase, openDebugModal } = useUserStore();

  useEffect(() => {
    initFromSupabase();
  }, [initFromSupabase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === "," || e.code === "Comma")) {
        e.preventDefault();
        openDebugModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openDebugModal]);

  useEffect(() => {
    try {
      const def = localStorage.getItem('debugDefaultOpen') === '1';
      if (def) openDebugModal();
    } catch {}
  }, [openDebugModal]);

  return (
    <header className="relative flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
      {/* Left */}
      <div className="flex items-center gap-6">
        <h1 className="text-xl font-semibold text-gray-900">云店+商品导入</h1>
        <nav className="flex gap-2">

          <button
            onClick={() => onTabChange("product")}
            className={`px-3 py-1 text-sm font-medium border-b-2 ${
              activeTab === "product"
                ? "text-primary-600 border-primary-600"
                : "text-gray-500 border-transparent hover:text-primary-600"
            }`}
          >
            产品导入
          </button>

          {/* 
          <button
            onClick={() => onTabChange("listing")}
            className={`px-3 py-1 text-sm font-medium border-b-2 ${
              activeTab === "listing"
                ? "text-primary-600 border-primary-600"
                : "text-gray-500 border-transparent hover:text-primary-600"
            }`}
          >
            全站导入
          </button>
          */}

        </nav>
      </div>

      {/* Right */}
      <div className="relative flex items-center gap-2">
        {process.env.NODE_ENV !== 'production' && (
          <span className="text-xs text-gray-600">免登录</span>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100"
          aria-label="User settings"
        >
          <User className="w-5 h-5 text-gray-600" />
          <Settings className="w-4 h-4 text-gray-600" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
            {!isAuthenticated ? (
              <button 
                onClick={() => {
                  openLoginModal();
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                登录
              </button>
            ) : (
              <>
                <div className="px-4 py-2 text-sm text-gray-600 border-b border-gray-100">
                  {user?.email}
                </div>
                <button 
                  onClick={() => {
                    openSettingsModal();
                    setOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  系统设置
                </button>
                <button 
                  onClick={() => {
                    logout();
                    setOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  退出登录
                </button>
              </>
            )}
          </div>
        )}
        
      </div>
      
      <LoginModal />
      <DebugPanel />
      <SettingsModal />
    </header>
  );
}