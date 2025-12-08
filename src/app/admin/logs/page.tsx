'use client';

import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import supabase from '@/lib/supabase';

export default function CreditLogsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterType, setFilterType] = useState('all');

  const fetchLogs = async (p: number, type: string) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/logs?page=${p}&type=${type}`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
        setTotalPages(data.pagination.totalPages);
        setPage(data.pagination.page);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1, filterType);
  }, [filterType]);

  const handlePageChange = (newPage: number) => {
      fetchLogs(newPage, filterType);
  };

  const exportCSV = () => {
    const headers = ['Date', 'User', 'Type', 'Amount', 'Description', 'Metadata'];
    const rows = logs.map(l => [
        new Date(l.created_at).toISOString(),
        l.user?.email || 'Unknown',
        l.type,
        l.amount,
        l.description,
        JSON.stringify(l.metadata || {})
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
        + headers.join(",") + "\n" 
        + rows.map(e => e.join(",")).join("\n");
        
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "credit_logs.csv");
    document.body.appendChild(link);
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Credit Logs</h2>
        <div className="flex gap-3">
             <select 
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
                <option value="all">All Types</option>
                <option value="admin_adjustment">Admin Adjustment</option>
                <option value="import_deduct">Import Deduct</option>
                <option value="recharge">Recharge</option>
                <option value="bonus">Bonus</option>
                <option value="refund">Refund</option>
                <option value="init">Init</option>
            </select>
            <button 
                onClick={exportCSV}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
                <Download className="w-4 h-4" />
                Export CSV
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
                 <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">Loading...</td>
                </tr>
            ) : logs.length === 0 ? (
                <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">No logs found</td>
                </tr>
            ) : (
                logs.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(l.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{l.user?.email || 'Unknown'}</td>
                    <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize
                            ${l.type === 'admin_adjustment' ? 'bg-purple-100 text-purple-800' : 
                              l.type === 'recharge' ? 'bg-green-100 text-green-800' :
                              l.type === 'import_deduct' ? 'bg-gray-100 text-gray-800' :
                              'bg-blue-100 text-blue-800'}
                        `}>
                            {l.type.replace('_', ' ')}
                        </span>
                    </td>
                    <td className={`px-6 py-4 text-sm font-bold ${l.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {l.amount > 0 ? '+' : ''}{l.amount}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 truncate max-w-xs" title={l.description}>
                        {l.description}
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
         {/* Pagination */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-700">
                Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
                <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 bg-white hover:bg-gray-50"
                >
                    Previous
                </button>
                <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page === totalPages}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 bg-white hover:bg-gray-50"
                >
                    Next
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}
