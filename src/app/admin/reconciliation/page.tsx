'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import supabase from '@/lib/supabase';

export default function ReconciliationPage() {
  const [discrepancies, setDiscrepancies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/admin/reconciliation', {
          headers: { 'Authorization': `Bearer ${session?.access_token}` }
        });
        const data = await res.json();
        if (data.discrepancies) {
          setDiscrepancies(data.discrepancies);
        }
      } finally {
        setLoading(false);
      }
    }
    check();
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">System Reconciliation</h2>
      
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold mb-4">Integrity Check (Credits vs Transactions)</h3>
        
        {loading ? (
            <p className="text-gray-500">Running verification scan...</p>
        ) : discrepancies.length === 0 ? (
            <div className="flex items-center gap-3 text-green-600 bg-green-50 p-4 rounded-lg">
                <CheckCircle className="w-6 h-6" />
                <span className="font-medium">All systems normal. No discrepancies found.</span>
            </div>
        ) : (
            <div className="space-y-4">
                <div className="flex items-center gap-3 text-red-600 bg-red-50 p-4 rounded-lg">
                    <AlertTriangle className="w-6 h-6" />
                    <span className="font-medium">Found {discrepancies.length} accounts with balance mismatch.</span>
                </div>
                
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b">
                            <th className="py-2">User ID</th>
                            <th className="py-2">Current Balance</th>
                            <th className="py-2">Calculated (from Logs)</th>
                            <th className="py-2">Difference</th>
                        </tr>
                    </thead>
                    <tbody>
                        {discrepancies.map((d, i) => (
                            <tr key={i} className="border-b">
                                <td className="py-2 font-mono text-xs">{d.user_id}</td>
                                <td className="py-2 font-bold text-red-600">{d.credits}</td>
                                <td className="py-2 font-bold text-green-600">{d.calculated}</td>
                                <td className="py-2 font-bold">{d.credits - d.calculated}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <p className="text-xs text-gray-500 mt-2">
                    * Calculated balance is derived from the sum of all transaction logs (init + recharges - deductions). 
                    If mismatch exists, it might be due to missing 'init' log for old users or concurrent update issues.
                </p>
            </div>
        )}
      </div>
    </div>
  );
}
