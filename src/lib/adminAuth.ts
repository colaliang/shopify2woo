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
