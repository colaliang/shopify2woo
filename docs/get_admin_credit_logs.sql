-- Function to get credit transaction logs for admin
-- Includes user email and supports pagination
CREATE OR REPLACE FUNCTION get_admin_credit_logs(
  page int DEFAULT 1,
  limit_count int DEFAULT 50,
  filter_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  user_email varchar,
  amount integer,
  type text,
  description text,
  metadata jsonb,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if the user is an admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH filtered_logs AS (
    SELECT
      ct.id,
      ct.user_id,
      ct.amount,
      ct.type,
      ct.description,
      ct.metadata,
      ct.created_at
    FROM public.credit_transactions ct
    WHERE (filter_type IS NULL OR ct.type = filter_type)
  ),
  total AS (
    SELECT count(*) AS count FROM filtered_logs
  )
  SELECT
    fl.id,
    fl.user_id,
    au.email::varchar as user_email,
    fl.amount,
    fl.type,
    fl.description,
    fl.metadata,
    fl.created_at,
    t.count as total_count
  FROM filtered_logs fl
  LEFT JOIN auth.users au ON fl.user_id = au.id
  CROSS JOIN total t
  ORDER BY fl.created_at DESC
  LIMIT limit_count
  OFFSET (page - 1) * limit_count;
END;
$$;

GRANT EXECUTE ON FUNCTION get_admin_credit_logs TO authenticated, service_role;
