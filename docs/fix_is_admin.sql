-- Fix for Admin API 500 Error
-- The is_admin() function fails when called from the server-side API (Service Role) because auth.uid() is null.
-- We need to update is_admin() to explicitly allow the 'service_role' role.

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Allow if the user has the service_role (e.g. called from server-side API with Service Key)
  IF (NULLIF(current_setting('request.jwt.claim.role', true), '')::text = 'service_role') THEN
    RETURN true;
  END IF;

  -- Standard check for authenticated users
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
  );
END;
$$;
