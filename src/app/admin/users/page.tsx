'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import supabase from '@/lib/supabase';

export default function UsersPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [users, setUsers] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [page] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Modal State
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        console.warn('No active session found');
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/admin/users?q=${query}&page=${page}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      });
      
      if (res.status === 401) {
         // Token might be expired or invalid
         console.error('Unauthorized access');
         return;
      }

      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch (err) {
      console.error('Fetch users error:', err);
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => {
    const timer = setTimeout(() => fetchUsers(), 500);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  const handleAdjust = async () => {
    if (!selectedUser || !adjustAmount || !adjustReason) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        alert('Authentication error. Please reload.');
        return;
      }

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          amount: adjustAmount,
          description: adjustReason
        })
      });
      if (res.ok) {
        alert('Credits adjusted successfully');
        setSelectedUser(null);
        setAdjustAmount(0);
        setAdjustReason('');
        fetchUsers(); // Refresh
      } else {
        alert('Operation failed');
      }
    } catch (e) {
      alert('Error: ' + e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">User Management</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by email, name..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-64"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credits</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-900">
                        {u.raw_user_meta_data?.name || u.raw_user_meta_data?.full_name || 'Unknown'}
                    </span>
                    <span className="text-sm text-gray-500">{u.email}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    (u.credits || 0) > 10 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {u.credits || 0}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button 
                    onClick={() => setSelectedUser(u)}
                    className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                  >
                    Adjust Credits
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && !loading && (
                <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500">No users found</td>
                </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Adjustment Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Adjust Credits: {selectedUser.email}</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Amount (Negative to deduct)</label>
                <input 
                  type="number" 
                  value={adjustAmount} 
                  onChange={(e) => setAdjustAmount(Number(e.target.value))}
                  className="w-full border p-2 rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Reason (Required)</label>
                <textarea 
                  value={adjustReason} 
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full border p-2 rounded"
                  placeholder="e.g. Manual refund, Bonus..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button 
                onClick={() => setSelectedUser(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button 
                onClick={handleAdjust}
                disabled={!adjustAmount || !adjustReason}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Confirm Adjustment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
