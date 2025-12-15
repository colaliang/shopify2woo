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

// CNY Prices for WeChat Pay
const CNY_PRICES = {
  'basic': 19.8,
  'pro': 69.8,
  'max': 298.8,
};

import Stripe from 'stripe';
import { createPayPalOrder } from '@/lib/paypal';

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
    
    // Determine Currency and Amount based on Payment Method
    let currency = 'usd';
    let unitAmount = Math.round(pkg.price * 100); // cents

    // Special handling for WeChat Pay: Use specific CNY pricing
    if (paymentMethod === 'wechat') {
        currency = 'cny';
        // Get CNY price from the mapping
        const cnyPrice = CNY_PRICES[packageId as keyof typeof CNY_PRICES] || 0;
        if (cnyPrice <= 0) {
           return NextResponse.json({ error: 'Invalid CNY price for package' }, { status: 400 });
        }
        unitAmount = Math.round(cnyPrice * 100); // fen
    }
    // Stripe (Card/Alipay) and PayPal remain in USD as per requirement
    // No exchange rate logic for them.

    // Common Stripe Session Params
    const commonSessionParams = {
        line_items: [
        {
            price_data: {
            currency: currency,
            product_data: {
                name: pkg.name,
                description: `${pkg.credits} Credits`,
            },
            unit_amount: unitAmount,
            },
            quantity: 1,
        },
        ],
        mode: 'payment' as const,
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
    };

    if (paymentMethod === 'stripe') {
      try {
        const paymentTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] = ['card', 'alipay']; 
        
        const session = await stripe.checkout.sessions.create({
          payment_method_types: paymentTypes,
          ...commonSessionParams,
        });

        if (session.url) {
          paymentUrl = session.url;
        } else {
          throw new Error('Failed to create Stripe session URL');
        }
      } catch (stripeError) {
        console.error('Stripe error details:', JSON.stringify(stripeError, null, 2));
        return NextResponse.json({ 
            error: 'Failed to initiate Stripe payment', 
            details: (stripeError as Error).message 
        }, { status: 500 });
      }

    } else if (paymentMethod === 'paypal') {
        let directPayPalSuccess = false;
        
        try {
            // Attempt Direct PayPal Integration
            const returnUrl = `${origin}/api/payment/paypal/return?orderId=${order.id}`;
            const cancelUrl = `${origin}/payment/result?status=cancel`;
            
            const paypalOrder = await createPayPalOrder(order.id, pkg.price, 'USD', returnUrl, cancelUrl);
            
            const approveLink = paypalOrder.links?.find((l: any) => l.rel === 'approve')?.href;
            
            if (approveLink) {
                paymentUrl = approveLink;
                // Update order with external ID
                await supabase.from('payment_orders').update({ external_id: paypalOrder.id }).eq('id', order.id);
                directPayPalSuccess = true;
            }
        } catch (directError) {
            console.warn('Direct PayPal attempt failed, falling back to Stripe:', directError);
        }

        if (!directPayPalSuccess) {
           try {
            const paypalConfigId = process.env.STRIPE_PAYPAL_CONFIG_ID;
        let session;

        try {
            if (paypalConfigId) {
                session = await stripe.checkout.sessions.create({
                    payment_method_configuration: paypalConfigId,
                    ...commonSessionParams,
                });
            } else {
                throw new Error('No config ID');
            }
        } catch (configError) {
            console.warn('Failed to use PayPal Config ID, falling back to manual type:', configError);
            // Fallback to manual 'paypal' type
            session = await stripe.checkout.sessions.create({
                payment_method_types: ['paypal'],
                ...commonSessionParams,
            });
        }

        if (session && session.url) {
            paymentUrl = session.url;
        } else {
            throw new Error('Failed to create PayPal session URL');
        }

      } catch (stripeError) {
        console.error('Stripe PayPal error details:', JSON.stringify(stripeError, null, 2));
        return NextResponse.json({ 
            error: 'Failed to initiate PayPal payment', 
            details: (stripeError as Error).message 
        }, { status: 500 });
      }
    }
    } else if (paymentMethod === 'wechat') {
        try {
            // Using Stripe WeChat Pay (Requires CNY currency, handled above)
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['wechat_pay'],
                payment_method_options: {
                    wechat_pay: { client: 'web' }, // 'web' is default, implies QR code
                },
                ...commonSessionParams,
            });

            if (session.url) {
                paymentUrl = session.url;
            } else {
                throw new Error('Failed to create WeChat Pay session URL');
            }
        } catch (stripeError) {
            console.error('Stripe WeChat Pay error details:', JSON.stringify(stripeError, null, 2));
            return NextResponse.json({ 
                error: 'Failed to initiate WeChat Pay', 
                details: (stripeError as Error).message 
            }, { status: 500 });
        }
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
