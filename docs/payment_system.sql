-- Create payment_orders table to track recharge requests
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id text NOT NULL, -- 'basic', 'pro', 'max'
  amount numeric(10, 2) NOT NULL, -- e.g. 2.99
  currency text NOT NULL DEFAULT 'USD',
  credits_amount integer NOT NULL, -- e.g. 300
  payment_method text NOT NULL, -- 'stripe' or 'wechat'
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  external_order_id text, -- Stripe Session ID or WeChat OutTradeNo
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own orders
CREATE POLICY payment_orders_select_own ON public.payment_orders
AS PERMISSIVE FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Index
CREATE INDEX IF NOT EXISTS payment_orders_user_idx ON public.payment_orders(user_id);
CREATE INDEX IF NOT EXISTS payment_orders_external_idx ON public.payment_orders(external_order_id);

-- Function to complete order and add credits (Transaction)
CREATE OR REPLACE FUNCTION complete_payment_order(
  p_order_id uuid,
  p_external_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_user_id uuid;
  v_credits integer;
  v_current_status text;
BEGIN
  -- Lock order row
  SELECT * INTO v_order FROM public.payment_orders WHERE id = p_order_id FOR UPDATE;
  
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Order not found');
  END IF;

  IF v_order.status = 'paid' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already paid');
  END IF;

  -- Update order status
  UPDATE public.payment_orders
  SET status = 'paid',
      external_order_id = COALESCE(external_order_id, p_external_id),
      updated_at = now()
  WHERE id = p_order_id;

  -- Add credits using existing function
  PERFORM add_user_credit(
    v_order.user_id, 
    v_order.credits_amount, 
    'recharge', 
    'Recharge ' || v_order.package_id, 
    jsonb_build_object('order_id', p_order_id)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
