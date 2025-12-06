import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';

// Middleware-like check for admin routes
export async function checkAdmin() {
  const supabase = getSupabaseServer();
  if (!supabase) return { error: 'Supabase client not initialized', status: 500 };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 };

  // Check admin table
  const { data: admin } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (!admin) return { error: 'Forbidden', status: 403 };

  return { user, supabase };
}

export async function GET(req: Request) {
  // This is just a helper file, but Next.js route handlers need an export.
  // We can use this route to verify admin status on client side.
  const check = await checkAdmin();
  if (check.error) return NextResponse.json({ error: check.error }, { status: check.status });
  return NextResponse.json({ isAdmin: true });
}
