import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { headers } from 'next/headers';
import { sendEmail } from '@/lib/resend';
import { EmailTemplates } from '@/lib/emailTemplates';

// This is a shared/mock webhook handler. 
// Real Stripe/WeChat webhooks would verify signatures here.

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { orderId, status } = body;

    // Security Check: Verify Webhook Secret
    // In production, this must be a shared secret known only to the payment provider (or test environment)
    const headersList = await headers();
    const secret = headersList.get('x-webhook-secret');
    const expectedSecret = process.env.PAYMENT_WEBHOOK_SECRET;

    // Only enforce if env var is set (recommended for production)
    if (expectedSecret && secret !== expectedSecret) {
         console.error('Webhook signature verification failed');
         return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!orderId || status !== 'paid') {
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    if (!supabase) {
        return NextResponse.json({ error: 'Supabase client not initialized' }, { status: 500 });
    }
    
    // Call the RPC function to complete order safely
    const { data, error } = await supabase.rpc('complete_payment_order', {
        p_order_id: orderId,
        p_external_id: 'mock_' + Date.now()
    });

    if (error) {
        console.error('Webhook RPC error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Send Notification
    // Fetch order details to get user_id and credits
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
                subject: 'Payment Successful - Yundian+ WordPress Products Import Assistant',
                html: EmailTemplates.orderPaid(orderId, order.credits_amount),
                userId: order.user_id,
                type: 'order_paid',
                metadata: { orderId }
            }).catch(e => console.error('Failed to send payment email', e));
        }
    }

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
