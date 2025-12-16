import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';

export async function POST(req: Request) {
  const auth = await checkAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase } = auth;
  if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
  }

  try {
      // 1. Get stored token to deauthorize (Optional but good practice)
      const { data } = await supabase
        .from('system_configs')
        .select('value')
        .eq('key', 'stripe_token')
        .single();

      if (data?.value?.stripe_user_id) {
          const clientSecret = process.env.STRIPE_SECRET_KEY;
          const clientId = process.env.NEXT_PUBLIC_STRIPE_CLIENT_ID;

          if (clientSecret && clientId) {
              // Deauthorize from Stripe
              // https://docs.stripe.com/connect/oauth-reference#post-oauth-deauthorize
              await fetch('https://connect.stripe.com/oauth/deauthorize', {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/x-www-form-urlencoded',
                      'Authorization': `Bearer ${clientSecret}`
                  },
                  body: new URLSearchParams({
                      client_id: clientId,
                      stripe_user_id: data.value.stripe_user_id
                  })
              }).catch(e => console.warn('Stripe deauth failed', e));
          }
      }

      // 2. Remove from DB
      const { error } = await supabase
        .from('system_configs')
        .delete()
        .eq('key', 'stripe_token');

      if (error) {
          throw error;
      }

      return NextResponse.json({ success: true });

  } catch (error) {
      console.error('Stripe Disconnect Error:', error);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
