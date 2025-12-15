import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';

export async function GET(req: Request) {
  const auth = await checkAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'PayPal Client ID not configured' }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${appUrl}/admin/payment/callback`;
  const scope = 'openid profile email https://uri.paypal.com/services/paypalattributes'; 
  const state = crypto.randomUUID(); 

  const isSandbox = process.env.NEXT_PUBLIC_PAYPAL_MODE === 'sandbox';
  const baseUrl = isSandbox ? 'https://www.sandbox.paypal.com' : 'https://www.paypal.com';
  
  const url = `${baseUrl}/connect?flowEntry=static&client_id=${clientId}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  return NextResponse.json({ url });
}
