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
    
      const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
      const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
      const isSandbox = process.env.NEXT_PUBLIC_PAYPAL_MODE === 'sandbox';
      const baseUrl = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
    
      if (!clientId || !clientSecret) {
        return NextResponse.json({ error: 'PayPal credentials missing' }, { status: 500 });
      }
    
      // Exchange Code
      const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: code
        })
      });
      
      const tokenData = await tokenRes.json();
      
      if (!tokenRes.ok) {
          console.error('PayPal Token Exchange Error:', tokenData);
          return NextResponse.json({ error: tokenData.error_description || 'Failed to exchange token' }, { status: 400 });
      }
      
      // Save to DB
      const { supabase } = auth;
      if (!supabase) {
        throw new Error('Supabase client is not available');
      }

      const { error: dbError } = await supabase
        .from('system_configs')
        .upsert({
            key: 'paypal_token',
            value: tokenData,
            is_secret: true,
            updated_at: new Date().toISOString()
        });
        
      if (dbError) {
          console.error('DB Error:', dbError);
          return NextResponse.json({ error: 'Failed to save configuration to system_configs table. Ensure migration is run.' }, { status: 500 });
      }
      
      return NextResponse.json({ success: true });
      
  } catch (err) {
      console.error(err);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
