-- Fix Admin Permissions and Search
-- This script ensures the admin check works for both Service Role (API) and User (Client) calls.

-- 1. Robust is_admin function
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_role text;
BEGIN
  -- Get the current role from request
  -- We use a safe approach to get the setting
  BEGIN
    current_role := current_setting('request.jwt.claim.role', true);
  EXCEPTION WHEN OTHERS THEN
    current_role := NULL;
  END;

  -- Allow if service_role (API calls with Service Key)
  IF current_role = 'service_role' THEN
    RETURN true;
  END IF;

  -- Check if user is in admin_users table
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
END;
$$;

-- 2. Update search_users_admin to use the new check
CREATE OR REPLACE FUNCTION search_users_admin(
  search_term text,
  page int DEFAULT 1,
  limit_count int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  email varchar,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  credits int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  clean_term text;
BEGIN
  -- Check admin permission
  IF NOT is_admin() THEN
    -- Debugging info in case of failure
    RAISE EXCEPTION 'Access denied. Role: %, UID: %', current_setting('request.jwt.claim.role', true), auth.uid();
  END IF;

  clean_term := TRIM(search_term);

  IF clean_term = '' THEN
    RETURN QUERY
    SELECT 
      au.id,
      au.email::varchar,
      au.raw_user_meta_data,
      au.created_at,
      uc.credits
    FROM auth.users au
    LEFT JOIN public.user_configs uc ON au.id = uc.user_id
    ORDER BY au.created_at DESC
    LIMIT limit_count
    OFFSET (page - 1) * limit_count;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    au.id,
    au.email::varchar,
    au.raw_user_meta_data,
    au.created_at,
    uc.credits
  FROM auth.users au
  LEFT JOIN public.user_configs uc ON au.id = uc.user_id
  WHERE 
    au.email ILIKE '%' || clean_term || '%'
    OR (au.raw_user_meta_data->>'name') ILIKE '%' || clean_term || '%'
    OR (au.raw_user_meta_data->>'full_name') ILIKE '%' || clean_term || '%'
    OR (au.raw_user_meta_data->>'nickname') ILIKE '%' || clean_term || '%'
    OR (au.raw_user_meta_data->>'user_name') ILIKE '%' || clean_term || '%'
    OR (au.raw_user_meta_data->>'username') ILIKE '%' || clean_term || '%'
    OR (au.raw_user_meta_data->>'preferred_username') ILIKE '%' || clean_term || '%'
    OR (au.raw_user_meta_data->>'email') ILIKE '%' || clean_term || '%'
  ORDER BY au.created_at DESC
  LIMIT limit_count
  OFFSET (page - 1) * limit_count;
END;
$$;

-- 3. Grant permissions explicitly
GRANT EXECUTE ON FUNCTION is_admin TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION search_users_admin TO authenticated, service_role;
