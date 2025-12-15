import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { capturePayPalOrder } from '@/lib/paypal';
import { sendEmail } from '@/lib/resend';
import { EmailTemplates } from '@/lib/emailTemplates';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token'); // PayPal Order ID
    const orderId = searchParams.get('orderId'); // Internal Order ID
    
    if (!token || !orderId) {
        return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    try {
        // 1. Capture PayPal Order
        const captureData = await capturePayPalOrder(token);
        
        if (captureData.status !== 'COMPLETED') {
             console.error('PayPal Capture Failed:', captureData);
             return NextResponse.redirect(new URL('/payment/result?status=failed', req.url));
        }

        // 2. Update Database
        const supabase = getSupabaseServer();
        if (!supabase) {
             throw new Error('Supabase client missing');
        }
        
        // Use RPC to complete order safely (handling credits transaction)
        const { error } = await supabase.rpc('complete_payment_order', {
             p_order_id: orderId,
             p_external_id: token
        });
        
        if (error) {
            console.error('DB Update Error:', error);
            // Even if DB update fails, payment is captured.
            return NextResponse.redirect(new URL('/payment/result?status=error', req.url));
        }

        // 3. Send Email (Async)
        // We need to fetch order details to get user email
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

        return NextResponse.redirect(new URL(`/payment/result?session_id=${token}&status=success`, req.url));

    } catch (error) {
        console.error('PayPal Return Error:', error);
        return NextResponse.redirect(new URL('/payment/result?status=error', req.url));
    }
}
