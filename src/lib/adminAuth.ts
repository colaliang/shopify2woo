import { getSupabaseServer } from '@/lib/supabaseServer';
import { headers } from 'next/headers';

// Middleware-like check for admin routes
export async function checkAdmin() {
  const supabase = getSupabaseServer();
  if (!supabase) return { error: 'Supabase client not initialized', status: 500 };

  // Get token from Authorization header
  const headersList = await headers();
  const authHeader = headersList.get('authorization');
  
  if (!authHeader) {
    return { error: 'Unauthorized: No token provided', status: 401 };
  }

  const token = authHeader.replace('Bearer ', '');

  if (!token || token === 'undefined' || token === 'null') {
    return { error: 'Unauthorized: Invalid token format', status: 401 };
  }

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

  // For RPC calls that use auth.uid(), we need to use a client that is authenticated as the user,
  // NOT the service role client.
  // However, the RPC search_users_admin needs special privileges (service role) to read all users.
  // BUT the RPC checks auth.uid() inside is_admin()!
  //
  // Solution: We must use the Service Role client (which has super powers) but we also need to pass
  // the context that we are authorized.
  // 
  // Our is_admin() function allows 'service_role' role.
  // When we use getSupabaseServer(), we are using the Service Role Key.
  // The Postgres role will be 'service_role'.
  // 
  // So, returning the service role client is correct.
  
  return { user, supabase };
}
