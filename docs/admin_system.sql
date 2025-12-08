-- 1. Admin Users Table
-- Allows designating specific users as admins
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view admin list (Wait, chicken and egg? No, allow read own)
CREATE POLICY admin_users_read_own ON public.admin_users
AS PERMISSIVE FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Allow if service_role (API calls with Service Key)
  -- We check the setting directly
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
    RETURN true;
  END IF;

  -- Standard check for authenticated users
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
END;
$$;

-- 2. RLS Policies for Admins to access other tables
-- We need to add policies to existing tables (user_configs, payment_orders, etc.)
-- to allow admins to READ ALL rows.

-- user_configs
CREATE POLICY admin_read_all_user_configs ON public.user_configs
AS PERMISSIVE FOR SELECT
TO authenticated
USING (is_admin());

CREATE POLICY admin_update_all_user_configs ON public.user_configs
AS PERMISSIVE FOR UPDATE
TO authenticated
USING (is_admin());

-- credit_transactions
CREATE POLICY admin_read_all_credit_transactions ON public.credit_transactions
AS PERMISSIVE FOR SELECT
TO authenticated
USING (is_admin());

-- payment_orders
CREATE POLICY admin_read_all_payment_orders ON public.payment_orders
AS PERMISSIVE FOR SELECT
TO authenticated
USING (is_admin());

-- 3. Statistics RPCs
-- Since auth.users is protected, we need a secure function to count users
CREATE OR REPLACE FUNCTION get_admin_stats(
  start_date timestamptz DEFAULT NULL,
  end_date timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_users bigint;
  v_new_users bigint;
  v_active_users bigint; -- Users with login or import activity recently
  v_total_revenue numeric;
  v_revenue_today numeric;
  v_revenue_month numeric;
BEGIN
  -- Set defaults
  IF start_date IS NULL THEN start_date := date_trunc('day', now()); END IF;
  IF end_date IS NULL THEN end_date := now(); END IF;

  -- User Stats
  SELECT count(*) INTO v_total_users FROM auth.users;
  
  SELECT count(*) INTO v_new_users 
  FROM auth.users 
  WHERE created_at >= start_date AND created_at <= end_date;

  -- Active Users (approximation using updated_at of user_configs or last_sign_in_at if accessible)
  -- Accessing auth.users.last_sign_in_at requires special privileges.
  -- Let's use user_configs.updated_at as a proxy for activity
  SELECT count(*) INTO v_active_users
  FROM public.user_configs
  WHERE updated_at >= (now() - interval '7 days');

  -- Revenue Stats
  SELECT COALESCE(SUM(amount), 0) INTO v_total_revenue
  FROM public.payment_orders
  WHERE status = 'paid';

  SELECT COALESCE(SUM(amount), 0) INTO v_revenue_today
  FROM public.payment_orders
  WHERE status = 'paid' AND created_at >= date_trunc('day', now());

  SELECT COALESCE(SUM(amount), 0) INTO v_revenue_month
  FROM public.payment_orders
  WHERE status = 'paid' AND created_at >= date_trunc('month', now());

  RETURN jsonb_build_object(
    'total_users', v_total_users,
    'new_users', v_new_users,
    'active_users', v_active_users,
    'total_revenue', v_total_revenue,
    'revenue_today', v_revenue_today,
    'revenue_month', v_revenue_month
  );
END;
$$;

-- 4. Chart Data RPCs
-- User Growth Trend (Last 30 days)
CREATE OR REPLACE FUNCTION get_user_growth_trend()
RETURNS TABLE (date text, count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    to_char(created_at, 'YYYY-MM-DD') as date,
    count(*) as count
  FROM auth.users
  WHERE created_at >= (now() - interval '30 days')
  GROUP BY 1
  ORDER BY 1;
END;
$$;

-- Revenue Trend (Last 30 days)
CREATE OR REPLACE FUNCTION get_revenue_trend()
RETURNS TABLE (date text, amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    to_char(created_at, 'YYYY-MM-DD') as date,
    COALESCE(SUM(po.amount), 0) as amount
  FROM public.payment_orders po
  WHERE status = 'paid' 
  AND created_at >= (now() - interval '30 days')
  GROUP BY 1
  ORDER BY 1;
END;
$$;

-- 5. User Search RPC
-- Search users by email or metadata name
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
  -- Check admin permission first
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Clean the search term
  clean_term := TRIM(search_term);

  -- If empty search term, return all users (paginated)
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
