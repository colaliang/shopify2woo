import Image from "next/image";
import { Settings, User, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useUserStore } from "@/stores/userStore";
import { useTranslation } from "react-i18next";
import LoginModal from "@/components/auth/LoginModal";
import SettingsModal from "@/components/auth/SettingsModal";
import RechargeModal from "@/components/auth/RechargeModal";
import DebugPanel from "@/components/auth/DebugPanel";
import ContactModal from "@/components/contact/ContactModal";

interface HeaderBarProps {
  activeTab: "listing" | "product";
  onTabChange: (tab: "listing" | "product") => void;
}

export default function HeaderBar({ activeTab, onTabChange }: HeaderBarProps) {
  const { t } = useTranslation();
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
        <div className="flex items-center gap-3">
          <Image 
            src="/logo.jpg" 
            alt="Logo" 
            width={32} 
            height={32} 
            className="w-8 h-8 rounded object-contain"
          />
          <h1 className="text-xl font-semibold text-gray-900">{t('app.title')}</h1>
        </div>
        <nav className="flex gap-2">

          <button
            onClick={() => onTabChange("product")}
            className={`px-3 py-1 text-sm font-medium border-b-2 ${
              activeTab === "product"
                ? "text-primary-600 border-primary-600"
                : "text-gray-500 border-transparent hover:text-primary-600"
            }`}
          >
            {t('nav.product_import')}
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
          <span className="text-xs text-gray-600">{t('auth.login.btn_login')} Free</span>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-100"
          aria-label="User settings"
        >
          {user?.avatar ? (
            <Image 
              src={user.avatar} 
              alt="User Avatar" 
              width={24}
              height={24}
              className="w-6 h-6 rounded-full object-cover border border-gray-200"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
              <User className="w-4 h-4 text-gray-600" />
            </div>
          )}
          <Settings className="w-6 h-6 text-gray-600" />
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
                {t('auth.login.btn_login')}
              </button>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="font-medium text-gray-900">{user?.name}</div>
                  {user?.email && !user.email.endsWith('wechat') && (
                    <div className="text-xs text-gray-500 mt-0.5 truncate">{user.email}</div>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-600 font-medium bg-gray-100 px-2 py-0.5 rounded-full">
                      {t('settings.user.credits', { credits: user?.credits ?? 0 })}
                    </span>
                  </div>
                </div>

                {/*
                <button 
                  onClick={() => {
                    openRechargeModal();
                    setOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 font-medium"
                >
                  充值 (Recharge)
                </button>
                */}

                <button 
                  onClick={() => {
                    openSettingsModal();
                    setOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {t('settings.title')}
                </button>
                <button 
                  onClick={() => {
                    logout();
                    setOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  {t('settings.user.logout')}
                </button>
              </>
            )}
          </div>
        )}
        
      </div>
      
      <LoginModal />
      <DebugPanel />
      <SettingsModal />
      <RechargeModal />
      <ContactModal />
    </header>
  );
}