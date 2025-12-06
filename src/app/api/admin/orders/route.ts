import { NextResponse } from 'next/server';
import { checkAdmin } from '../check/route';

export async function GET(req: Request) {
  const { supabase, error, status } = await checkAdmin();
  if (error || !supabase) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = 50;
  const offset = (page - 1) * limit;

  try {
    const { data, error, count } = await supabase
        .from('payment_orders')
        .select('*, user:user_id(email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({ 
        orders: data, 
        pagination: { page, limit, total: count, totalPages: Math.ceil((count || 0) / limit) } 
    });
  } catch (e) {
    console.error('Admin orders error:', e);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
