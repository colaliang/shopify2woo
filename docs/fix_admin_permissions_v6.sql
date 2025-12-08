-- Fix Admin Permissions - VERSION 6 (No Drop, Update Only)
-- This version uses CREATE OR REPLACE to update existing functions without breaking dependencies.

-- 1. Update is_admin function
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  claim_role text;
BEGIN
  -- Try to get the role from the JWT claims
  claim_role := nullif(current_setting('request.jwt.claim.role', true), '');

  -- 1. Allow if role is 'service_role' (API Service Key)
  IF claim_role = 'service_role' THEN
    RETURN true;
  END IF;
  
  -- 2. Allow if the actual database user is a superuser (e.g. postgres)
  IF current_user IN ('postgres', 'supabase_admin') THEN
    RETURN true;
  END IF;

  -- 3. Standard check: Is the authenticated user in the admin_users table?
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
END;
$$;

-- 2. Update search_users_admin function
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
    RAISE EXCEPTION 'Access denied. Role: %, User: %, UID: %', 
      current_setting('request.jwt.claim.role', true), 
      current_user,
      auth.uid();
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

-- 3. Grant permissions
GRANT EXECUTE ON FUNCTION is_admin TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION search_users_admin TO authenticated, service_role;
