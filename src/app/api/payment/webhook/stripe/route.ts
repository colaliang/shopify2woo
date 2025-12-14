import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { headers } from 'next/headers';

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const sig = headersList.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (!sig || !webhookSecret) {
        console.warn('Missing stripe signature or webhook secret');
        // If no secret is configured, we can't verify. 
        // In production this should fail, but for development we might proceed if we trust the source (unsafe).
        // Better to error out.
        if (!webhookSecret) {
            console.error('STRIPE_WEBHOOK_SECRET is not set');
            return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
        }
        return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${(err as Error).message}`);
    return NextResponse.json({ error: `Webhook Error: ${(err as Error).message}` }, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      
      // Fulfill the purchase...
      const orderId = session.metadata?.orderId || session.client_reference_id;
      
      if (orderId) {
          console.log(`Processing successful payment for order ${orderId}`);
          const supabase = getSupabaseServer();
          if (supabase) {
              const { data, error } = await supabase.rpc('complete_payment_order', {
                  p_order_id: orderId,
                  p_external_id: session.id
              });
              
              if (error) {
                  console.error('Error completing order in DB:', error);
                  return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
              }
              console.log('Order completed result:', data);
          } else {
              console.error('Supabase client not available in webhook');
              return NextResponse.json({ error: 'Internal error' }, { status: 500 });
          }
      } else {
          console.warn('No orderId found in session metadata');
      }
      break;
    }
    
    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object;
      const errorMessage = paymentIntent.last_payment_error?.message || 'Unknown error';
      console.error(`Payment failed for PaymentIntent ${paymentIntent.id}: ${errorMessage}`);
      
      // TODO: Log to database if needed
      // const orderId = paymentIntent.metadata?.orderId;
      // if (orderId) { ... }
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object;
      console.log(`Charge refunded: ${charge.id}`);
      // Handle refund logic here
      break;
    }
    
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
