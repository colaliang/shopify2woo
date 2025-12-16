-- Ensure system_configs table exists for Stripe configuration
-- The table structure is reused from PayPal integration:
-- key TEXT PRIMARY KEY
-- value JSONB
-- is_secret BOOLEAN
-- updated_at TIMESTAMPTZ

-- We will use 'stripe_token' as the key.
-- The value will store:
-- {
--   "access_token": "...",
--   "refresh_token": "...",
--   "stripe_user_id": "...", (Merchant ID)
--   "stripe_publishable_key": "...",
--   "scope": "...",
--   "livemode": boolean,
--   "merchantName": "...", (Optional)
--   "merchantEmail": "..." (Optional)
-- }

-- Just in case, ensure the table exists (idempotent)
CREATE TABLE IF NOT EXISTS system_configs (
    key TEXT PRIMARY KEY,
    value JSONB,
    is_secret BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS if not enabled
ALTER TABLE system_configs ENABLE ROW LEVEL SECURITY;

-- Ensure policy exists (idempotent if name conflict, but good for docs)
-- CREATE POLICY "Allow service role full access" ON system_configs ...
