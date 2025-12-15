import { createClient } from '@supabase/supabase-js';

export const isSandbox = process.env.NEXT_PUBLIC_PAYPAL_MODE === 'sandbox';
export const baseUrl = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

// Use a service role client to access system_configs
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Helper to get access token
export async function getPayPalAccessToken() {
    // 1. Try to get from system_configs (if stored via OAuth flow)
    if (supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data } = await supabase
            .from('system_configs')
            .select('value')
            .eq('key', 'paypal_token')
            .single();

        if (data?.value?.access_token) {
            // Check expiry? For now return it.
            // In a real app, check 'expires_in' or handle 401 and refresh.
            return data.value.access_token;
        }
    }

    // 2. Fallback: Client Credentials Flow using Env Vars
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('PayPal credentials not configured');
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(`PayPal Auth Failed: ${err.error_description || err.error}`);
    }

    const json = await res.json();
    return json.access_token;
}

export async function createPayPalOrder(orderId: string, amount: number, currency: string, returnUrl: string, cancelUrl: string) {
    const accessToken = await getPayPalAccessToken();
    
    const payload = {
        intent: 'CAPTURE',
        purchase_units: [{
            custom_id: orderId, // Link to our internal order ID
            amount: {
                currency_code: currency,
                value: amount.toString()
            }
        }],
        application_context: {
            return_url: returnUrl,
            cancel_url: cancelUrl
        }
    };

    const res = await fetch(`${baseUrl}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(`Create Order Failed: ${JSON.stringify(err)}`);
    }

    return res.json();
}

export async function verifyPayPalWebhookSignature(req: Request, webhookId: string) {
    const accessToken = await getPayPalAccessToken();
    const headersList = req.headers;
    const body = await req.json();

    const verificationPayload = {
        auth_algo: headersList.get('paypal-auth-algo'),
        cert_url: headersList.get('paypal-cert-url'),
        transmission_id: headersList.get('paypal-transmission-id'),
        transmission_sig: headersList.get('paypal-transmission-sig'),
        transmission_time: headersList.get('paypal-transmission-time'),
        webhook_id: webhookId,
        webhook_event: body
    };

    const res = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(verificationPayload)
    });

    if (!res.ok) {
        throw new Error('Verification API call failed');
    }

    const data = await res.json();
    return data.verification_status === 'SUCCESS';
}

export async function capturePayPalOrder(orderId: string) {
    const accessToken = await getPayPalAccessToken();

    const res = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
        }
    });

    if (!res.ok) {
        const err = await res.json();
        // If already captured, it might return 422. Check details if needed.
        throw new Error(`Capture Order Failed: ${JSON.stringify(err)}`);
    }

    return res.json();
}
