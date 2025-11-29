import { NextResponse } from 'next/server';
import { getSupabaseServer, getUserIdFromToken } from '@/lib/supabaseServer';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 500));
    const requestId = searchParams.get('requestId') || '';
    const auth = request.headers.get('authorization') || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const disableAuth = process.env.NEXT_PUBLIC_DISABLE_AUTH === '1' || process.env.DISABLE_AUTH === '1';
    const userId = (await getUserIdFromToken(bearer)) || (disableAuth ? '__LOCAL__' : null);
    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json([], { status: 200 });
    let q = supabase.from('import_logs').select('level,message,created_at').order('created_at', { ascending: false }).limit(limit);
    if (userId) q = q.eq('user_id', userId);
    if (requestId) q = q.eq('request_id', requestId);
    const { data } = await q;
    type Row = { level?: string; message?: string; created_at?: string };
    const logs = (data || []).map((d) => {
      const r = d as Row;
      return {
        id: Math.random().toString(36).slice(2),
        timestamp: String(r.created_at || ''),
        level: String(r.level || ''),
        message: String(r.message || ''),
      };
    });
    return NextResponse.json(logs);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
