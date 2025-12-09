import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { headers } from 'next/headers';
import { sendEmail } from '@/lib/resend';
import { EmailTemplates } from '@/lib/emailTemplates';
import { stripe } from '@/lib/stripe';

const PACKAGES = {
  'basic': { credits: 300, price: 2.99, name: 'Basic Package' },
  'pro': { credits: 1500, price: 9.99, name: 'Professional Package' },
  'max': { credits: 10000, price: 39.99, name: 'Enterprise Package' },
};

import Stripe from 'stripe';

export async function POST(req: Request) {
  try {
    const { packageId, paymentMethod } = await req.json();

    // 1. Auth Check
    const supabase = getSupabaseServer();
    if (!supabase) {
        return NextResponse.json({ error: 'Supabase client not initialized' }, { status: 500 });
    }

    const headersList = await headers();
    const authHeader = headersList.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    const origin = headersList.get('origin') || 'http://localhost:3000';

    if (!token) {
        return NextResponse.json({ error: 'Unauthorized: No token' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Validate Input
    const pkg = PACKAGES[packageId as keyof typeof PACKAGES];
    if (!pkg) {
      return NextResponse.json({ error: 'Invalid package' }, { status: 400 });
    }

    // 3. Create Order in DB
    const { data: order, error: orderError } = await supabase
      .from('payment_orders')
      .insert({
        user_id: user.id,
        package_id: packageId,
        amount: pkg.price,
        currency: 'USD',
        credits_amount: pkg.credits,
        payment_method: paymentMethod,
        status: 'pending'
      })
      .select()
      .single();

    if (orderError) {
      console.error('Create order error:', orderError);
      return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }

    // Send Order Created Email (Async)
    if (user.email) {
      sendEmail({
        to: user.email,
        subject: 'Order Confirmation - Yundian+ WordPress Products Import Assistant',
        html: EmailTemplates.orderCreated(order.id, pkg.price, 'USD', pkg.name),
        userId: user.id,
        type: 'order_created',
        metadata: { orderId: order.id }
      }).catch(err => console.error('Failed to send order created email', err));
    }

    // 4. Initiate Payment
    let paymentUrl = '';
    
    if (paymentMethod === 'stripe') {
      try {
        // NOTE: 'paypal' and 'alipay' must be enabled in your Stripe Dashboard (Test Mode)
        // Link: https://dashboard.stripe.com/test/settings/payment_methods
        // If you see "The payment method type 'paypal' is invalid", it means it's not enabled yet.
        // We are keeping it enabled here. If it fails, please check the dashboard.
        // For now, I will remove 'paypal' to ensure the basic flow works, uncomment it when enabled.
        // const paymentTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] = ['card', 'alipay']; 
        const paymentTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] = ['card', 'alipay', 'paypal']; // Uncomment this line after enabling PayPal in Stripe Dashboard

        const session = await stripe.checkout.sessions.create({
          payment_method_types: paymentTypes,
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: pkg.name,
                  description: `${pkg.credits} Credits`,
                },
                unit_amount: Math.round(pkg.price * 100), // Stripe expects cents
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `${origin}/payment/result?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/payment/result?status=cancel`,
          client_reference_id: order.id,
          metadata: {
            orderId: order.id,
            userId: user.id,
            packageId: packageId,
            credits: pkg.credits,
          },
          customer_email: user.email,
        });

        if (session.url) {
          paymentUrl = session.url;
        } else {
          throw new Error('Failed to create Stripe session URL');
        }
      } catch (stripeError) {
        console.error('Stripe error details:', JSON.stringify(stripeError, null, 2));
        // Return detailed error for debugging
        return NextResponse.json({ 
            error: 'Failed to initiate Stripe payment', 
            details: (stripeError as Error).message 
        }, { status: 500 });
      }

    } else if (paymentMethod === 'wechat') {
      // MOCK for now
      paymentUrl = `/api/payment/mock-pay?orderId=${order.id}&method=wechat`;
    } else {
        return NextResponse.json({ error: 'Invalid payment method' }, { status: 400 });
    }

    return NextResponse.json({ 
        orderId: order.id, 
        paymentUrl 
    });

  } catch (error) {
    console.error('Create order api error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
