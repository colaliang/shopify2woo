import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';

export async function GET() {
  const { supabase, error, status } = await checkAdmin();
  if (error || !supabase) return NextResponse.json({ error }, { status });

  try {
    const { data: stats, error: rpcError } = await supabase.rpc('get_admin_stats');
    if (rpcError) throw rpcError;

    const { data: growth, error: growthError } = await supabase.rpc('get_user_growth_trend');
    if (growthError) throw growthError;

    const { data: revenue, error: revenueError } = await supabase.rpc('get_revenue_trend');
    if (revenueError) throw revenueError;

    return NextResponse.json({
      overview: stats,
      charts: {
        growth,
        revenue
      }
    });
  } catch (e) {
    console.error('Admin stats error:', e);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
