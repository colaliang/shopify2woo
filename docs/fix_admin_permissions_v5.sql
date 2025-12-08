-- Fix Admin Permissions - VERSION 5 (Fail-safe)
DROP FUNCTION IF EXISTS is_admin();
DROP FUNCTION IF EXISTS search_users_admin(text, int, int);

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
  -- This helps when running from dashboard SQL editor or direct connections
  IF current_user IN ('postgres', 'supabase_admin') THEN
    RETURN true;
  END IF;

  -- 3. Standard check: Is the authenticated user in the admin_users table?
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
END;
$$;

-- (The search function remains the same, but we recreate it to link to the new is_admin)
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
    -- Enhanced error message for debugging
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

GRANT EXECUTE ON FUNCTION is_admin TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION search_users_admin TO authenticated, service_role;
