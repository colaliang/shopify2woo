import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';

// This is a shared/mock webhook handler. 
// Real Stripe/WeChat webhooks would verify signatures here.

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { orderId, status } = body;

    if (!orderId || status !== 'paid') {
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    if (!supabase) {
        return NextResponse.json({ error: 'Supabase client not initialized' }, { status: 500 });
    }
    
    // Call the RPC function to complete order safely
    const { data, error } = await supabase.rpc('complete_payment_order', {
        p_order_id: orderId,
        p_external_id: 'mock_' + Date.now()
    });

    if (error) {
        console.error('Webhook RPC error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
