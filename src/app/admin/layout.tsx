'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { LayoutDashboard, Users, ShoppingCart, FileText, AlertOctagon, LogOut, MessageSquare, PenTool, Settings } from 'lucide-react';
import { useUserStore } from '@/stores/userStore';
import supabase from '@/lib/supabase';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, initFromSupabase, logout } = useUserStore();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    initFromSupabase();
  }, [initFromSupabase]);

  useEffect(() => {
    if (isAuthenticated === false) {
      // router.push('/'); // Don't redirect immediately, might be loading
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    // Check admin status
    async function check() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setIsAdmin(false);
          router.push('/');
          return;
        }

        const res = await fetch('/api/admin/check', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        });
        
        if (res.ok) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
          router.push('/');
        }
      } catch {
        setIsAdmin(false);
        router.push('/');
      }
    }
    check();
  }, [router]);

  if (isAdmin === null) {
    return <div className="min-h-screen flex items-center justify-center">Loading Admin Panel...</div>;
  }

  if (!isAdmin) return null;

  const navItems = [
    { name: 'Overview', href: '/admin', icon: LayoutDashboard },
    { name: 'Users & Credits', href: '/admin/users', icon: Users },
    { name: 'Orders & Revenue', href: '/admin/orders', icon: ShoppingCart },
    { name: 'Credit Logs', href: '/admin/logs', icon: FileText },
    { name: 'Messages', href: '/admin/contacts', icon: MessageSquare },
    { name: 'Reconciliation', href: '/admin/reconciliation', icon: AlertOctagon },
    { name: 'Content Management', href: '/admin/content', icon: PenTool },
    { name: 'Settings', href: '/admin/settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-md flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-800">Admin Console</h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive 
                    ? 'bg-blue-50 text-blue-700' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <button 
            onClick={() => { logout(); router.push('/'); }}
            className="flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg w-full"
          >
            <LogOut className="w-5 h-5" />
            Exit Admin
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  );
}
