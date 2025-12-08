-- Fix Credit Transactions Constraint and Deduct Function
-- 1. The check constraint on credit_transactions.type is too restrictive and doesn't allow 'admin_adjustment'.
-- 2. The deduct_user_credit function hardcodes 'import_deduct' type, preventing admin deductions with custom types.

-- Part 1: Fix Constraint
DO $$
BEGIN
  -- Drop the existing constraint if it exists
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_transactions_type_check') THEN
    ALTER TABLE public.credit_transactions DROP CONSTRAINT credit_transactions_type_check;
  END IF;

  -- Add the new constraint with expanded allowed values
  ALTER TABLE public.credit_transactions 
  ADD CONSTRAINT credit_transactions_type_check 
  CHECK (type IN ('import_deduct', 'recharge', 'bonus', 'refund', 'init', 'admin_adjustment'));
END $$;

-- Part 2: Update deduct_user_credit to accept p_type
-- We DROP the old function first to avoid "function is not unique" ambiguity,
-- because the new signature with a default value could overlap with the old signature.
DROP FUNCTION IF EXISTS deduct_user_credit(uuid, integer, text, jsonb);

CREATE OR REPLACE FUNCTION deduct_user_credit(
  p_user_id uuid,
  p_amount integer, -- Positive number to deduct
  p_description text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_type text DEFAULT 'import_deduct' -- New parameter with default
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
    -- Initialize if not exists
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
    p_user_id, -p_amount, v_current_balance, v_new_balance, p_type, p_description, p_metadata
  );

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$;

-- Part 3: Update add_user_credit just to be safe (ensure it allows admin_adjustment)
-- It already accepts p_type, so we just ensure the constraint update (Part 1) covers it.
-- No changes needed to add_user_credit code if it just passes p_type through.
