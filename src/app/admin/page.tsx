'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Users, TrendingUp, CreditCard, Activity } from 'lucide-react';
import supabase from '@/lib/supabase';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [charts, setCharts] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/admin/stats', {
          headers: { 'Authorization': `Bearer ${session?.access_token}` }
        });
        const data = await res.json();
        if (data.overview) {
          setStats(data.overview);
          setCharts(data.charts);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div>Loading dashboard...</div>;

  const cards = [
    { title: 'Total Users', value: stats?.total_users, icon: Users, color: 'bg-blue-500' },
    { title: 'Active (7d)', value: stats?.active_users, icon: Activity, color: 'bg-green-500' },
    { title: 'Revenue (Total)', value: `$${stats?.total_revenue}`, icon: CreditCard, color: 'bg-purple-500' },
    { title: 'Revenue (Month)', value: `$${stats?.revenue_month}`, icon: TrendingUp, color: 'bg-orange-500' },
  ];

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-800">Overview</h2>
      
      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, i) => {
           const Icon = card.icon;
           return (
             <div key={i} className="bg-white rounded-xl shadow-sm p-6 border border-gray-100 flex items-center justify-between">
               <div>
                 <p className="text-sm text-gray-500 font-medium">{card.title}</p>
                 <p className="text-2xl font-bold text-gray-900 mt-1">{card.value || 0}</p>
               </div>
               <div className={`p-3 rounded-lg ${card.color} bg-opacity-10`}>
                 <Icon className={`w-6 h-6 ${card.color.replace('bg-', 'text-')}`} />
               </div>
             </div>
           );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-6">User Growth (30 Days)</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={charts?.growth || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{fontSize: 12}} tickMargin={10} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold mb-6">Revenue Trend (30 Days)</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts?.revenue || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{fontSize: 12}} tickMargin={10} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="amount" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
