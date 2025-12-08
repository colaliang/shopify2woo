-- Create subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed')),
  preferences jsonb DEFAULT '{"order_updates": true, "marketing": true, "frequency": "immediate"}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_user_id_key UNIQUE (user_id)
);

-- Enable RLS for subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view and update their own subscription
CREATE POLICY subscriptions_select_own ON public.subscriptions
AS PERMISSIVE FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY subscriptions_update_own ON public.subscriptions
AS PERMISSIVE FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY subscriptions_insert_own ON public.subscriptions
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Create notification_logs table
CREATE TABLE IF NOT EXISTS public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL, -- 'order_created', 'order_paid', etc.
  channel text NOT NULL DEFAULT 'email',
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'pending')),
  provider_id text, -- Resend ID
  error text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS for logs (Admins view all, users view own maybe?)
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_logs_select_own ON public.notification_logs
AS PERMISSIVE FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Index for performance
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS notification_logs_user_idx ON public.notification_logs(user_id);
