-- Suggestion for a new table to track admin access logs
-- This can be used to track access to Sanity Studio and other protected areas

CREATE TABLE IF NOT EXISTS public.admin_access_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id),
    resource TEXT NOT NULL, -- e.g. 'sanity-studio', 'admin-panel'
    action TEXT NOT NULL,   -- e.g. 'access', 'write'
    success BOOLEAN DEFAULT false,
    details TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_access_logs ENABLE ROW LEVEL SECURITY;

-- Allow admins to view logs
CREATE POLICY "Admins can view access logs" ON public.admin_access_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_users 
            WHERE user_id = auth.uid()
        )
    );

-- Allow system (via API) to insert logs
-- Note: This requires the API to use service_role key or an authenticated user with permission
-- For client-side inserts via API route (using service role), we don't strictly need a policy if RLS is bypassed by service role.
