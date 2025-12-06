'use client';

import { useState, useEffect } from 'react';
import { Download, Filter } from 'lucide-react';

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchOrders = async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders?page=${p}`);
      const data = await res.json();
      if (data.orders) {
        setOrders(data.orders);
        setTotalPages(data.pagination.totalPages);
        setPage(data.pagination.page);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders(1);
  }, []);

  const exportCSV = () => {
    const headers = ['Order ID', 'User', 'Package', 'Amount', 'Currency', 'Method', 'Status', 'Date'];
    const rows = orders.map(o => [
        o.id,
        o.user?.email || 'Unknown',
        o.package_id,
        o.amount,
        o.currency,
        o.payment_method,
        o.status,
        new Date(o.created_at).toISOString()
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
        + headers.join(",") + "\n" 
        + rows.map(e => e.join(",")).join("\n");
        
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "payment_orders.csv");
    document.body.appendChild(link);
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">Orders & Revenue</h2>
        <div className="flex gap-3">
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Package</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-xs font-mono text-gray-500">{o.id.slice(0, 8)}...</td>
                <td className="px-6 py-4 text-sm text-gray-900">{o.user?.email || 'Unknown'}</td>
                <td className="px-6 py-4 text-sm text-gray-600 capitalize">{o.package_id}</td>
                <td className="px-6 py-4 text-sm font-bold text-gray-900">${o.amount}</td>
                <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize
                        ${o.payment_method === 'wechat' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}
                    `}>
                        {o.payment_method}
                    </span>
                </td>
                <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize
                        ${o.status === 'paid' ? 'bg-green-100 text-green-800' : o.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}
                    `}>
                        {o.status}
                    </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{new Date(o.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {orders.length === 0 && !loading && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-500">No orders found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center gap-2">
         <button 
           disabled={page <= 1}
           onClick={() => fetchOrders(page - 1)}
           className="px-4 py-2 border rounded disabled:opacity-50"
         >
           Prev
         </button>
         <span className="px-4 py-2">Page {page} of {totalPages}</span>
         <button 
           disabled={page >= totalPages}
           onClick={() => fetchOrders(page + 1)}
           className="px-4 py-2 border rounded disabled:opacity-50"
         >
           Next
         </button>
      </div>
    </div>
  );
}
