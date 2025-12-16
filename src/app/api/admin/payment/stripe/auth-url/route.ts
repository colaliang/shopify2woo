import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';

export async function GET(req: Request) {
  const auth = await checkAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const clientId = process.env.NEXT_PUBLIC_STRIPE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Stripe Client ID not configured' }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = `${appUrl}/admin/payment/stripe/callback`;
  
  // State to prevent CSRF
  const state = crypto.randomUUID(); 

  // Stripe OAuth URL
  // https://docs.stripe.com/connect/oauth-reference
  const url = `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${clientId}&scope=read_write&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  return NextResponse.json({ url });
}
