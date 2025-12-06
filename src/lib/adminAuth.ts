import { getSupabaseServer } from '@/lib/supabaseServer';
import { headers } from 'next/headers';

// Middleware-like check for admin routes
export async function checkAdmin() {
  const supabase = getSupabaseServer();
  if (!supabase) return { error: 'Supabase client not initialized', status: 500 };

  // Get token from Authorization header
  const headersList = await headers();
  const authHeader = headersList.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) return { error: 'Unauthorized: No token provided', status: 401 };

  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    console.error('Admin auth error:', error);
    return { error: 'Unauthorized: Invalid token', status: 401 };
  }

  // Check admin table
  const { data: admin } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (!admin) return { error: 'Forbidden: Not an admin', status: 403 };

  return { user, supabase };
}
