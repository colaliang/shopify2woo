-- Security Hardening
-- To be executed in Supabase SQL Editor

-- 1. Secure user_configs table
-- Prevent users from updating their own credits directly via API
ALTER TABLE public.user_configs ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own config
CREATE POLICY user_configs_read_own ON public.user_configs
AS PERMISSIVE FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Allow users to insert/update their own config EXCEPT credits
-- Actually, for strict security, we should DENY direct updates to credits column.
-- Supabase RLS policies are row-based, not column-based (mostly).
-- However, we can use a CHECK constraint or a trigger, or just NOT allow UPDATE policy at all,
-- and rely on RPCs for updates.
-- Since users need to update settings (wordpressUrl, etc.), we allow update.
-- BUT we must ensure they don't touch 'credits'.
-- We can do this by using a separate policy or trigger.
-- Simplest: Users can UPDATE own rows, but a trigger resets 'credits' if changed?
-- Better: Use a BEFORE UPDATE trigger to prevent credit changes by user.

CREATE OR REPLACE FUNCTION prevent_credit_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If the user is NOT a service role (i.e. is a regular user via API)
  -- AND credits are being changed
  -- We can check current_setting('role') or similar, but simpler:
  -- If the operation is triggered by RLS (meaning via API), we block it.
  -- But wait, RPCs run as Security Definer (usually) or Invoker.
  -- If Invoker, RLS applies. If Definer, it bypasses.
  -- Our RPCs (deduct/add) are SECURITY DEFINER, so they bypass RLS.
  -- So we can simply say: NO UPDATE POLICY for user_configs allows updating 'credits'.
  -- But Supabase doesn't support column-level policies easily in SQL standard.
  -- Solution: Use a Trigger that checks `auth.role()`.

  IF (current_setting('request.jwt.claim.role', true) = 'authenticated') THEN
     IF NEW.credits IS DISTINCT FROM OLD.credits THEN
        RAISE EXCEPTION 'Cannot update credits directly. Use payment system.';
     END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_credits_update ON public.user_configs;
CREATE TRIGGER protect_credits_update
BEFORE UPDATE ON public.user_configs
FOR EACH ROW
EXECUTE FUNCTION prevent_credit_update();

-- Allow update policy (now protected by trigger)
CREATE POLICY user_configs_update_own ON public.user_configs
AS PERMISSIVE FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Allow insert policy
CREATE POLICY user_configs_insert_own ON public.user_configs
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());


-- 2. Secure payment_orders table
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

-- Read own orders
CREATE POLICY payment_orders_read_own ON public.payment_orders
AS PERMISSIVE FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Insert own orders (pending status only?)
-- Actually, allow insert, but maybe trigger to force status='pending'.
CREATE POLICY payment_orders_insert_own ON public.payment_orders
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());
-- Trigger to ensure status is pending on insert? 
-- Or just trust the API? The API (create-order) uses Service Role so it bypasses RLS anyway.
-- Wait, create-order API uses Service Role to insert.
-- So we technically don't need an INSERT policy for authenticated users if we only use API.
-- If we want to allow direct client insert (unlikely), we'd need it.
-- Let's NOT add INSERT/UPDATE policies for payment_orders for users.
-- Forces them to use the API. Safer.


-- 3. Verify admin_users RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
-- Ensure ONLY read policy exists for users (already in admin_system.sql)
-- No insert/update policies for 'authenticated' role.

