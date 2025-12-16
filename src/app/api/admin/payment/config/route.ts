import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';
import { getPayPalAccessToken } from '@/lib/paypal';

const isSandbox = process.env.NEXT_PUBLIC_PAYPAL_MODE === 'sandbox';
const baseUrl = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

export async function GET(req: Request) {
  const auth = await checkAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase } = auth;
  if (!supabase) {
    return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
  }

  try {
      // 1. Get Token from DB
      const { data } = await supabase
        .from('system_configs')
        .select('value, updated_at')
        .eq('key', 'paypal_token')
        .single();

      if (!data || !data.value) {
          return NextResponse.json({ connected: false });
      }

      // 2. Read Merchant Info from stored config
      // We stored this during the exchange step
      const merchantName = data.value.merchantName || '';
      const merchantEmail = data.value.merchantEmail || '';

      // Optional: Refresh if empty? For now, just rely on what's stored.
      
      return NextResponse.json({ 
          connected: true, 
          connectedAt: data.updated_at,
          merchantName,
          merchantEmail
      });

  } catch (error) {
      console.error('Config Fetch Error:', error);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
