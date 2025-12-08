-- Fix for Admin Reconciliation API
-- The function verify_credit_consistency_v2 likely lacks permissions or the admin check.

CREATE OR REPLACE FUNCTION verify_credit_consistency_v2()
RETURNS TABLE (
  user_id uuid,
  current_balance integer,
  calculated_balance integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check admin permission
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT 
    uc.user_id,
    uc.credits,
    (SELECT COALESCE(SUM(ct.amount), 0)::integer FROM public.credit_transactions ct WHERE ct.user_id = uc.user_id) AS calculated_balance
  FROM public.user_configs uc
  WHERE uc.credits <> (SELECT COALESCE(SUM(ct.amount), 0)::integer FROM public.credit_transactions ct WHERE ct.user_id = uc.user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION verify_credit_consistency_v2 TO authenticated, service_role;
