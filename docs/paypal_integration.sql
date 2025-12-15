-- Create a table for system-wide configurations, including payment settings
CREATE TABLE IF NOT EXISTS public.system_configs (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    is_secret boolean DEFAULT false, -- Flag to indicate if the value contains sensitive data
    description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_configs ENABLE ROW LEVEL SECURITY;

-- Policies
-- Only admins can read/write system configs
CREATE POLICY admin_all_system_configs ON public.system_configs
    AS PERMISSIVE FOR ALL
    TO authenticated
    USING (is_admin())
    WITH CHECK (is_admin());

-- Insert initial config placeholder for PayPal (optional)
-- INSERT INTO public.system_configs (key, value, description)
-- VALUES ('paypal_config', '{"mode": "sandbox", "connected": false}'::jsonb, 'PayPal payment integration settings')
-- ON CONFLICT (key) DO NOTHING;
