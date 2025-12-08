import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { checkAdmin } from '@/lib/adminAuth';

export async function GET(req: Request) {
  try {
    // 1. Check Admin Permission
    const adminCheck = await checkAdmin();
    if (adminCheck.error) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
    }

    // 2. Parse Query Params
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    
    const offset = (page - 1) * limit;

    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ error: 'Database error' }, { status: 500 });

    // 3. Build Query
    let query = supabase
      .from('contact_submissions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`description.ilike.%${search}%,contact_info.ilike.%${search}%,category.ilike.%${search}%`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error('Fetch contacts error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data,
      total: count,
      page,
      limit,
      totalPages: count ? Math.ceil(count / limit) : 0
    });
  } catch (error) {
    console.error('Admin contacts API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
