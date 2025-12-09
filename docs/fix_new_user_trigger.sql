-- Ensure the trigger function exists
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

-- Ensure the trigger is attached to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_credits();
