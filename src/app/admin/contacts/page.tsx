'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Search, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import supabase from '@/lib/supabase';

interface ContactSubmission {
  id: string;
  user_id: string | null;
  description: string;
  category: string;
  contact_info: string;
  status: string;
  created_at: string;
  ip_address: string | null;
}

export default function AdminContactsPage() {
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  // Detail Modal State
  const [selectedSubmission, setSelectedSubmission] = useState<ContactSubmission | null>(null);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        search,
        status: statusFilter
      });

      const res = await fetch(`/api/admin/contacts?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      if (res.ok) {
        setSubmissions(data.data || []);
        setTotalPages(data.totalPages || 1);
      } else {
        console.error(data.error);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchSubmissions();
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">User Messages</h1>
        <div className="flex items-center gap-2">
            {/* Maybe export button later */}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-wrap gap-4 items-center">
        <form onSubmit={handleSearch} className="flex-1 min-w-[300px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search content, contact info..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </form>
        
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
        >
          <option value="">All Status</option>
          <option value="new">New</option>
          <option value="read">Read</option>
          <option value="resolved">Resolved</option>
        </select>

        <button 
          onClick={() => fetchSubmissions()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-700">Time</th>
                <th className="px-6 py-4 font-semibold text-gray-700">Category</th>
                <th className="px-6 py-4 font-semibold text-gray-700">Contact</th>
                <th className="px-6 py-4 font-semibold text-gray-700">Description</th>
                <th className="px-6 py-4 font-semibold text-gray-700">Status</th>
                <th className="px-6 py-4 font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading...
                  </td>
                </tr>
              ) : submissions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No messages found.
                  </td>
                </tr>
              ) : (
                submissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                      {new Date(sub.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-gray-900 font-medium">
                      <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                        {sub.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      <div>{sub.contact_info}</div>
                      <div className="text-xs text-gray-400">{sub.user_id ? 'Reg. User' : 'Guest'}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-600 max-w-xs truncate" title={sub.description}>
                      {sub.description}
                    </td>
                    <td className="px-6 py-4">
                       <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                         sub.status === 'new' ? 'bg-blue-100 text-blue-700' :
                         sub.status === 'resolved' ? 'bg-green-100 text-green-700' :
                         'bg-gray-100 text-gray-700'
                       }`}>
                         {sub.status.toUpperCase()}
                       </span>
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => setSelectedSubmission(sub)}
                        className="p-2 hover:bg-gray-200 rounded-full text-gray-500 hover:text-blue-600"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-xl font-bold">Message Details</h3>
              <button 
                onClick={() => setSelectedSubmission(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase">Category</label>
                  <div className="font-medium">{selectedSubmission.category}</div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Status</label>
                  <div className="font-medium capitalize">{selectedSubmission.status}</div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Contact Info</label>
                  <div className="font-medium">{selectedSubmission.contact_info}</div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Submitted At</label>
                  <div className="font-medium">{new Date(selectedSubmission.created_at).toLocaleString()}</div>
                </div>
                 <div>
                  <label className="text-xs text-gray-500 uppercase">User ID</label>
                  <div className="font-medium text-xs font-mono">{selectedSubmission.user_id || 'N/A'}</div>
                </div>
                 <div>
                  <label className="text-xs text-gray-500 uppercase">IP Address</label>
                  <div className="font-medium text-xs font-mono">{selectedSubmission.ip_address || 'N/A'}</div>
                </div>
              </div>
              
              <div>
                <label className="text-xs text-gray-500 uppercase block mb-2">Description</label>
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 whitespace-pre-wrap text-sm">
                  {selectedSubmission.description}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-lg flex justify-end gap-3">
               <button
                onClick={() => setSelectedSubmission(null)}
                className="px-4 py-2 bg-white border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
