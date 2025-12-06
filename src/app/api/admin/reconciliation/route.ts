import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';

export async function GET(req: Request) {
  const { supabase, error, status } = await checkAdmin();
  if (error || !supabase) return NextResponse.json({ error }, { status });

  try {
    const { data, error } = await supabase.rpc('verify_credit_consistency_v2');
    if (error) throw error;

    return NextResponse.json({ discrepancies: data });
  } catch (e) {
    console.error('Admin recon error:', e);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
