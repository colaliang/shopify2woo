import { NextResponse } from 'next/server';
import { verifyPayPalWebhookSignature } from '@/lib/paypal';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { sendEmail } from '@/lib/resend';
import { EmailTemplates } from '@/lib/emailTemplates';

export async function POST(req: Request) {
    try {
        // 1. Get Webhook ID from Env (Must be configured in .env)
        const webhookId = process.env.PAYPAL_WEBHOOK_ID;
        if (!webhookId) {
            console.error('PAYPAL_WEBHOOK_ID is not set');
            return NextResponse.json({ error: 'Configuration Error' }, { status: 500 });
        }

        // 2. Clone request to read body for verification and processing
        // Verification needs the raw body potentially, but Next.js Req is stream.
        // We'll read it as text first.
        const rawBody = await req.text();
        
        // Re-construct a request object for the verification helper if needed, 
        // or just pass the parsed body if the helper is adapted.
        // Our helper expects req.json() to be callable.
        // Let's adjust: We need to parse it ourselves.
        const body = JSON.parse(rawBody);

        // Mock a request-like object for our helper or refactor helper.
        // Let's refactor the usage here:
        // We need headers.
        const headersList = req.headers;

        // Verify
        // Note: verifyPayPalWebhookSignature in lib/paypal.ts currently calls req.json().
        // Since we already read the body, we can't call req.json() again on the same stream.
        // We should update the helper or manually call the verification API here.
        // Let's assume we update the helper to take (headers, body, webhookId).
        // For now, I'll inline the logic to be safe or mock the req.
        
        // Inline Verification Logic (adapted from lib/paypal)
        // ------------------------------------------------
        const { getPayPalAccessToken, baseUrl } = await import('@/lib/paypal');
        const accessToken = await getPayPalAccessToken();
        
        const verificationPayload = {
            auth_algo: headersList.get('paypal-auth-algo'),
            cert_url: headersList.get('paypal-cert-url'),
            transmission_id: headersList.get('paypal-transmission-id'),
            transmission_sig: headersList.get('paypal-transmission-sig'),
            transmission_time: headersList.get('paypal-transmission-time'),
            webhook_id: webhookId,
            webhook_event: body
        };

        const verifyRes = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(verificationPayload)
        });

        if (!verifyRes.ok) {
            console.error('PayPal Verify API Failed', await verifyRes.text());
            return NextResponse.json({ error: 'Verification Failed' }, { status: 400 });
        }

        const verifyData = await verifyRes.json();
        if (verifyData.verification_status !== 'SUCCESS') {
             console.error('PayPal Signature Invalid');
             return NextResponse.json({ error: 'Invalid Signature' }, { status: 401 });
        }
        // ------------------------------------------------

        // 3. Process Event
        const eventType = body.event_type;
        const resource = body.resource;
        
        console.log(`Received PayPal Webhook: ${eventType}`);

        if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
            // "custom_id" should be our orderId
            const orderId = resource.custom_id;
            const captureId = resource.id;

            if (orderId) {
                const supabase = getSupabaseServer();
                if (supabase) {
                    const { error } = await supabase.rpc('complete_payment_order', {
                        p_order_id: orderId,
                        p_external_id: captureId
                    });
                    
                    if (error) {
                        console.error('Database update failed:', error);
                        return NextResponse.json({ error: 'DB Error' }, { status: 500 });
                    }

                    // Send Email
                    const { data: order } = await supabase
                        .from('payment_orders')
                        .select('user_id, credits_amount')
                        .eq('id', orderId)
                        .single();

                    if (order && order.user_id) {
                        const { data: userData } = await supabase.auth.admin.getUserById(order.user_id);
                        const email = userData.user?.email;
                        if (email) {
                            sendEmail({
                                to: email,
                                subject: 'Payment Successful - Yundian+',
                                html: EmailTemplates.orderPaid(orderId, order.credits_amount),
                                userId: order.user_id,
                                type: 'order_paid',
                                metadata: { orderId }
                            }).catch(e => console.error('Email error:', e));
                        }
                    }
                }
            } else {
                console.warn('No custom_id found in PayPal resource');
            }
        }

        return NextResponse.json({ received: true });

    } catch (error) {
        console.error('PayPal Webhook Error:', error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
