import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';

export async function POST(req: Request) {
  const auth = await checkAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
      const { code } = await req.json();
      if (!code) {
        return NextResponse.json({ error: 'Code is required' }, { status: 400 });
      }
    
      const clientSecret = process.env.STRIPE_SECRET_KEY; // Using Secret Key for exchange
      if (!clientSecret) {
        return NextResponse.json({ error: 'Stripe Secret Key missing' }, { status: 500 });
      }
    
      // Exchange Code for Access Token
      // https://docs.stripe.com/connect/oauth-reference#post-oauth-token
      const tokenRes = await fetch('https://connect.stripe.com/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_secret: clientSecret,
            code: code,
            // assert: true // Optional
        })
      });
      
      const tokenData = await tokenRes.json();
      
      if (!tokenRes.ok) {
          console.error('Stripe Token Exchange Error:', tokenData);
          return NextResponse.json({ error: tokenData.error_description || 'Failed to exchange token' }, { status: 400 });
      }
      
      // Save to DB
      const { supabase } = auth;
      if (!supabase) {
        throw new Error('Supabase client is not available');
      }

      // Try to get Merchant Details if possible (e.g. from Stripe API using the new access token)
      let merchantInfo = {};
      try {
          // Use the connected account's ID to fetch account details
          // We need to use our Platform's Secret Key, but act on behalf of the connected account? 
          // Actually, standard OAuth response gives us 'stripe_user_id' which is the account ID.
          // To get email/name, we can retrieve the account details.
          
          const accountId = tokenData.stripe_user_id;
          if (accountId) {
             const accountRes = await fetch(`https://api.stripe.com/v1/accounts/${accountId}`, {
                 headers: {
                     'Authorization': `Bearer ${clientSecret}`, // Use Platform Secret Key
                 }
             });
             
             if (accountRes.ok) {
                 const accountData = await accountRes.json();
                 merchantInfo = {
                     merchantName: accountData.business_profile?.name || accountData.settings?.dashboard?.display_name || '',
                     merchantEmail: accountData.email || ''
                 };
             }
          }
      } catch (err) {
          console.warn('Failed to fetch Stripe account details:', err);
      }

      const { error: dbError } = await supabase
        .from('system_configs')
        .upsert({
            key: 'stripe_token',
            value: { ...tokenData, ...merchantInfo },
            is_secret: true,
            updated_at: new Date().toISOString()
        });
        
      if (dbError) {
          console.error('DB Error:', dbError);
          return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 });
      }
      
      return NextResponse.json({ success: true });
      
  } catch (err) {
      console.error(err);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
