-- Function to get all orders with user email for Admin Panel
-- This is needed because the JS client cannot easily join auth.users with public tables
-- due to permissions and schema restrictions.

DROP FUNCTION IF EXISTS get_admin_orders(int, int);

CREATE OR REPLACE FUNCTION get_admin_orders(
  page int DEFAULT 1,
  limit_count int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  user_email varchar,
  package_id text,
  amount numeric,
  currency text,
  credits_amount integer,
  payment_method text,
  status text,
  external_order_id text,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  offset_val int;
BEGIN
  -- Check admin permission
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  offset_val := (page - 1) * limit_count;

  RETURN QUERY
  SELECT 
    po.id,
    po.user_id,
    au.email::varchar as user_email,
    po.package_id,
    po.amount,
    po.currency,
    po.credits_amount,
    po.payment_method,
    po.status,
    po.external_order_id,
    po.metadata,
    po.created_at,
    po.updated_at,
    (SELECT count(*) FROM public.payment_orders)::bigint as total_count
  FROM public.payment_orders po
  LEFT JOIN auth.users au ON po.user_id = au.id
  ORDER BY po.created_at DESC
  LIMIT limit_count
  OFFSET offset_val;
END;
$$;

GRANT EXECUTE ON FUNCTION get_admin_orders TO authenticated, service_role;
