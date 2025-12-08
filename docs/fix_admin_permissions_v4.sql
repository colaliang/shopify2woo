-- Fix Admin Permissions - FINAL VERSION
-- Please copy and paste the ENTIRE content of this file into the Supabase SQL Editor.
-- This version removes all variable declarations that were causing syntax errors.

-- 1. Drop existing functions to ensure clean update (optional but safer)
DROP FUNCTION IF EXISTS is_admin();
DROP FUNCTION IF EXISTS search_users_admin(text, int, int);

-- 2. Create is_admin function (No variables)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if the role is 'service_role' (used by API)
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
    RETURN true;
  END IF;

  -- Check if user is in admin_users table
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
END;
$$;

-- 3. Create search_users_admin function
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
    RAISE EXCEPTION 'Access denied';
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

-- 4. Grant permissions
GRANT EXECUTE ON FUNCTION is_admin TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION search_users_admin TO authenticated, service_role;
