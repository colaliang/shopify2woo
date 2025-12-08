import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';

export async function GET(req: Request) {
  const { supabase, error, status } = await checkAdmin();
  if (error || !supabase) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const type = searchParams.get('type') || null;
  const limit = 50;

  try {
    const { data, error } = await supabase.rpc('get_admin_credit_logs', {
        page: page,
        limit_count: limit,
        filter_type: type === 'all' ? null : type
    });

    if (error) throw error;
    
    const count = data?.[0]?.total_count || 0;
    
    const logs = data?.map((log: any) => ({
        id: log.id,
        user_id: log.user_id,
        amount: log.amount,
        type: log.type,
        description: log.description,
        metadata: log.metadata,
        created_at: log.created_at,
        user: { email: log.user_email }
    })) || [];

    return NextResponse.json({ 
        logs: logs, 
        pagination: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) } 
    });
  } catch (e) {
    console.error('Admin logs error:', e);
    return NextResponse.json({ 
      error: 'Internal Error', 
      details: e instanceof Error ? e.message : String(e) 
    }, { status: 500 });
  }
}
