import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';

export async function GET(req: Request) {
  const { supabase, error, status } = await checkAdmin();
  if (error || !supabase) return NextResponse.json({ error }, { status });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || '';
  const page = parseInt(searchParams.get('page') || '1');
  
  try {
    // Use the secure RPC for searching users including auth data
    const { data, error } = await supabase.rpc('search_users_admin', {
        search_term: query,
        page: page,
        limit_count: 20
    });

    if (error) throw error;

    return NextResponse.json({ users: data });
  } catch (e) {
    console.error('Admin user search error:', e);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { supabase, user: adminUser, error, status } = await checkAdmin();
  if (error || !supabase) return NextResponse.json({ error }, { status });

  try {
    const body = await req.json();
    const { userId, amount, description } = body;

    if (!userId || !amount || !description) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const func = amount > 0 ? 'add_user_credit' : 'deduct_user_credit';
    const absAmount = Math.abs(amount);

    const { data, error: rpcError } = await supabase.rpc(func, {
        p_user_id: userId,
        p_amount: absAmount,
        p_type: 'admin_adjustment',
        p_description: description,
        p_metadata: { operator_id: adminUser.id, reason: description }
    });

    if (rpcError) throw rpcError;

    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error('Admin credit adjust error:', e);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
