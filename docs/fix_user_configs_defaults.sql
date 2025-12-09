-- Fix user_configs table to allow inserting new users without wordpress config
-- This is necessary because the trigger 'on_auth_user_created_credits' tries to insert into user_configs
-- without providing wordpress_url, consumer_key, and consumer_secret, which are NOT NULL.

-- Option 1: Set defaults (Recommended)
ALTER TABLE public.user_configs 
ALTER COLUMN wordpress_url SET DEFAULT '',
ALTER COLUMN consumer_key SET DEFAULT '',
ALTER COLUMN consumer_secret SET DEFAULT '';

-- Option 2: Update the trigger function (As a safeguard)
CREATE OR REPLACE FUNCTION public.handle_new_user_credits()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_configs (user_id, credits, wordpress_url, consumer_key, consumer_secret)
  VALUES (NEW.id, 30, '', '', '')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
