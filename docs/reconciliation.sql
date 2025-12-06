-- Function to verify credit consistency
-- It recalculates the balance from transactions and compares with user_configs
-- Returns users with mismatched balances
CREATE OR REPLACE FUNCTION verify_credit_consistency()
RETURNS TABLE (
  user_id uuid,
  current_balance integer,
  calculated_balance integer,
  difference integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH calculated AS (
    SELECT 
      t.user_id,
      SUM(t.amount)::integer + 30 AS calc_bal -- Assuming 30 is base? No, init transaction should be there.
      -- Actually, if we use 'init' transaction type, we can sum everything.
      -- But our current init logic in trigger creates user_configs directly.
      -- Let's assume the base is 30 if no init transaction found? 
      -- Better approach:
      -- We should record an 'init' transaction when user is created.
      -- Current trigger: inserts into user_configs (credits=30).
      -- Ideally, we should also insert into credit_transactions.
    FROM public.credit_transactions t
    GROUP BY t.user_id
  ),
  -- Wait, if we don't have an 'init' transaction row, the sum will be just deductions/recharges.
  -- We need to fix the trigger to also log the init transaction.
  real_balances AS (
    SELECT uc.user_id, uc.credits FROM public.user_configs uc
  )
  SELECT 
    rb.user_id,
    rb.credits,
    COALESCE(c.calc_bal, 0) + 30, -- Hard to be precise without 'init' row.
    rb.credits - (COALESCE(c.calc_bal, 0) + 30)
  FROM real_balances rb
  LEFT JOIN calculated c ON rb.user_id = c.user_id
  WHERE rb.credits <> (COALESCE(c.calc_bal, 0) + 30);
END;
$$;

-- Fix the trigger to also log the init transaction for better audit
CREATE OR REPLACE FUNCTION public.handle_new_user_credits()
RETURNS trigger AS $$
BEGIN
  -- Insert config
  INSERT INTO public.user_configs (user_id, credits)
  VALUES (NEW.id, 30)
  ON CONFLICT (user_id) DO NOTHING;

  -- Log transaction
  INSERT INTO public.credit_transactions (
    user_id, amount, balance_before, balance_after, type, description
  ) VALUES (
    NEW.id, 30, 0, 30, 'init', 'Welcome Bonus'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create trigger (it replaces function, but need to make sure)
-- (The previous SQL file already set the trigger to use this function name)

-- Update the verification function now that we have init transactions (for new users)
-- For old users, we might still have a gap.
-- Revised Verification Function:
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
  RETURN QUERY
  SELECT 
    uc.user_id,
    uc.credits,
    (SELECT COALESCE(SUM(amount), 0)::integer FROM public.credit_transactions WHERE user_id = uc.user_id)
  FROM public.user_configs uc
  WHERE uc.credits <> (SELECT COALESCE(SUM(amount), 0)::integer FROM public.credit_transactions WHERE user_id = uc.user_id);
END;
$$;
