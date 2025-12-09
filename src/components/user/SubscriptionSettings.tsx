'use client';
import { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabaseClient';
import { useTranslation } from 'react-i18next';

interface Subscription {
  status: 'active' | 'unsubscribed';
  preferences: {
    order_updates: boolean;
    marketing: boolean;
    frequency: 'immediate' | 'daily' | 'weekly';
  };
}

export default function SubscriptionSettings() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sub, setSub] = useState<Subscription>({
    status: 'active',
    preferences: { order_updates: true, marketing: true, frequency: 'immediate' }
  });

  useEffect(() => {
    fetchSub();
  }, []);

  const fetchSub = async () => {
    try {
      // We can use the API route we just created
      // But we need the token. The browser client handles session automatically if we use supabase client,
      // but here we are calling our own API.
      // Actually, we can just use the supabase client directly if RLS is set up!
      // But let's use the API to be consistent with the backend logic (defaults etc).
      // To use the API, we need to pass the token. 
      // Easier path: Use Supabase Client directly for data fetching if policies allow.
      // The SQL created allows: SELECT, INSERT, UPDATE for own user.
      
      const supabase = getSupabaseBrowser();
      if (!supabase) return;

      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) return;

      const res = await fetch('/api/subscription', {
        headers: {
            'Authorization': `Bearer ${session.access_token}`
        }
      });
      const data = await res.json();
      if (data.subscription) {
        setSub(data.subscription);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) return;
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(sub)
      });
      
      if (!res.ok) throw new Error('Failed to save');
      
      const data = await res.json();
      if (data.subscription) setSub(data.subscription);
      alert(t('settings.sub.saved'));
    } catch {
      alert(t('settings.sub.error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-4 flex justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-white/50 dark:bg-black/20">
      <h3 className="font-medium text-lg">{t('settings.sub.title')}</h3>
      
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{t('settings.sub.label')}</label>
        <button 
          onClick={() => setSub({...sub, status: sub.status === 'active' ? 'unsubscribed' : 'active'})}
          className={`px-3 py-1 rounded-full text-xs ${sub.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
        >
          {sub.status === 'active' ? t('settings.sub.status.subscribed') : t('settings.sub.status.unsubscribed')}
        </button>
      </div>

      {sub.status === 'active' && (
        <div className="space-y-3 pl-2 border-l-2 border-gray-200 ml-1">
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              checked={sub.preferences.order_updates}
              onChange={e => setSub({...sub, preferences: {...sub.preferences, order_updates: e.target.checked}})}
              id="pref_orders"
            />
            <label htmlFor="pref_orders" className="text-sm">{t('settings.sub.pref.orders')}</label>
          </div>

          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              checked={sub.preferences.marketing}
              onChange={e => setSub({...sub, preferences: {...sub.preferences, marketing: e.target.checked}})}
              id="pref_marketing"
            />
            <label htmlFor="pref_marketing" className="text-sm">{t('settings.sub.pref.marketing')}</label>
          </div>

          <div className="flex flex-col gap-1 mt-2">
             <label className="text-xs text-gray-500">{t('settings.sub.pref.freq')}</label>
             <select 
               value={sub.preferences.frequency}
               onChange={e => setSub({...sub, preferences: {...sub.preferences, frequency: e.target.value as 'immediate' | 'daily' | 'weekly'}})}
               className="text-sm border rounded p-1"
             >
               <option value="immediate">{t('settings.sub.pref.immediate')}</option>
               <option value="daily">{t('settings.sub.pref.daily')}</option>
               <option value="weekly">{t('settings.sub.pref.weekly')}</option>
             </select>
          </div>
        </div>
      )}

      <button 
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors shadow-sm mt-4"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {t('settings.sub.save_btn') || 'Save Preferences'}
      </button>
    </div>
  );
}
