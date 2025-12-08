import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';

export async function GET(req: Request) {
  const { supabase, error, status } = await checkAdmin();
  if (error || !supabase) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = 50;
  const offset = (page - 1) * limit;

  try {
    const { data, error } = await supabase.rpc('get_admin_orders', {
        page: page,
        limit_count: limit
    });

    if (error) throw error;

    // Transform data to match expected frontend format
    // The RPC returns flat structure, we need to nest user email if frontend expects it
    // But based on previous code: .select('*, user:user_id(email)')
    // The frontend likely expects { ...order, user: { email: '...' } }
    
    const count = data?.[0]?.total_count || 0;
    
    const orders = data?.map((order: any) => ({
        id: order.id,
        user_id: order.user_id,
        package_id: order.package_id,
        amount: order.amount,
        currency: order.currency,
        credits_amount: order.credits_amount,
        payment_method: order.payment_method,
        status: order.status,
        external_order_id: order.external_order_id,
        metadata: order.metadata,
        created_at: order.created_at,
        updated_at: order.updated_at,
        user: { email: order.user_email }
    })) || [];

    return NextResponse.json({ 
        orders: orders, 
        pagination: { page, limit, total: Number(count), totalPages: Math.ceil(Number(count) / limit) } 
    });
  } catch (e) {
    console.error('Admin orders error:', e);
    // Return detailed error for debugging
    return NextResponse.json({ 
      error: 'Internal Error', 
      details: e instanceof Error ? e.message : String(e) 
    }, { status: 500 });
  }
}
