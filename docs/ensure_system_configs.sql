-- Ensure system_configs table exists
CREATE TABLE IF NOT EXISTS system_configs (
    key TEXT PRIMARY KEY,
    value JSONB,
    is_secret BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE system_configs ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can read secrets (or specific logic)
-- For now, allow admin to read/write if needed, but our code uses service role for writing.
-- Let's ensure basic policies.

CREATE POLICY "Allow service role full access" ON system_configs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
    
-- Allow admins to read non-secret configs (optional, if needed by frontend directly)
CREATE POLICY "Allow admins to read public configs" ON system_configs
    FOR SELECT
    TO authenticated
    USING (is_secret = false);
