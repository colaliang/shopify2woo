-- 1. Add credits column to user_configs (default 30 for new users)
ALTER TABLE public.user_configs 
ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 30;

-- Update existing rows to have 30 credits if they are null
UPDATE public.user_configs SET credits = 30 WHERE credits IS NULL;

-- 2. Create credit_transactions table for audit logs
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- Negative for deduction, Positive for recharge
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  type text NOT NULL CHECK (type IN ('import_deduct', 'recharge', 'bonus', 'refund', 'init')),
  description text,
  metadata jsonb DEFAULT '{}'::jsonb, -- Store product_id, order_id, etc.
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own transactions
CREATE POLICY credit_transactions_select_own ON public.credit_transactions
AS PERMISSIVE FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Index
CREATE INDEX IF NOT EXISTS credit_transactions_user_idx ON public.credit_transactions(user_id);

-- 3. RPC Function: Deduct Credit (Atomic)
CREATE OR REPLACE FUNCTION deduct_user_credit(
  p_user_id uuid,
  p_amount integer, -- Positive number to deduct (e.g. 1)
  p_description text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance integer;
  v_new_balance integer;
BEGIN
  -- Lock the row
  SELECT credits INTO v_current_balance
  FROM public.user_configs
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    -- Initialize if not exists (should have been created by trigger, but just in case)
    INSERT INTO public.user_configs (user_id, credits)
    VALUES (p_user_id, 30)
    ON CONFLICT (user_id) DO UPDATE SET credits = 30
    RETURNING credits INTO v_current_balance;
  END IF;

  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient credits');
  END IF;

  v_new_balance := v_current_balance - p_amount;

  -- Update balance
  UPDATE public.user_configs
  SET credits = v_new_balance,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Log transaction
  INSERT INTO public.credit_transactions (
    user_id, amount, balance_before, balance_after, type, description, metadata
  ) VALUES (
    p_user_id, -p_amount, v_current_balance, v_new_balance, 'import_deduct', p_description, p_metadata
  );

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- 4. RPC Function: Add Credit (Recharge)
CREATE OR REPLACE FUNCTION add_user_credit(
  p_user_id uuid,
  p_amount integer,
  p_type text, -- 'recharge', 'bonus', etc.
  p_description text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_balance integer;
  v_new_balance integer;
BEGIN
  -- Lock the row
  SELECT credits INTO v_current_balance
  FROM public.user_configs
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    INSERT INTO public.user_configs (user_id, credits)
    VALUES (p_user_id, 0) -- Should create with 0 then add, but wait, if user is new, maybe 30?
                          -- Let's stick to 0 base for recharge if missing.
    ON CONFLICT (user_id) DO UPDATE SET credits = 0 -- ensure we start from clean slate if corrupted
    RETURNING credits INTO v_current_balance;
  END IF;

  v_new_balance := v_current_balance + p_amount;

  -- Update balance
  UPDATE public.user_configs
  SET credits = v_new_balance,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- Log transaction
  INSERT INTO public.credit_transactions (
    user_id, amount, balance_before, balance_after, type, description, metadata
  ) VALUES (
    p_user_id, p_amount, v_current_balance, v_new_balance, p_type, p_description, p_metadata
  );

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- 5. Trigger to initialize credits for new users
-- Function to handle new user insertion
CREATE OR REPLACE FUNCTION public.handle_new_user_credits()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_configs (user_id, credits)
  VALUES (NEW.id, 30)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger
DROP TRIGGER IF EXISTS on_auth_user_created_credits ON auth.users;
CREATE TRIGGER on_auth_user_created_credits
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user_credits();
