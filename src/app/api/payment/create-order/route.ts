import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { headers } from 'next/headers';

const PACKAGES = {
  'basic': { credits: 300, price: 2.99, name: 'Basic Package' },
  'pro': { credits: 1500, price: 9.99, name: 'Professional Package' },
  'max': { credits: 10000, price: 39.99, name: 'Enterprise Package' },
};

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

    // 4. Initiate Payment (Mock / Skeleton)
    let paymentUrl = '';
    
    if (paymentMethod === 'stripe') {
      // MOCK for now
      paymentUrl = `/api/payment/mock-pay?orderId=${order.id}&method=stripe`; 
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
