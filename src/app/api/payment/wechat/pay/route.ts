import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { WeChatPay } from '@/lib/wechatPay';
import { headers } from 'next/headers';

export async function POST(req: Request) {
    try {
        const { orderId } = await req.json();

        // 1. Auth & Order Validation
        const supabase = getSupabaseServer();
        if (!supabase) return NextResponse.json({ error: 'Server Error' }, { status: 500 });

        const headersList = await headers();
        const authHeader = headersList.get('authorization');
        const token = authHeader?.replace('Bearer ', '');
        
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // 2. Fetch Order
        const { data: order, error: orderError } = await supabase
            .from('payment_orders')
            .select('*')
            .eq('id', orderId)
            .eq('user_id', user.id)
            .single();

        if (orderError || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
        if (order.status === 'paid') return NextResponse.json({ error: 'Order already paid' }, { status: 400 });

        // 3. Fetch WeChat Config
        const { data: configData } = await supabase
            .from('system_configs')
            .select('value')
            .eq('key', 'wechat_pay_config')
            .single();

        if (!configData?.value) {
            return NextResponse.json({ error: 'WeChat Pay not configured' }, { status: 500 });
        }

        const wxConfig = configData.value;
        const wxPay = new WeChatPay({
            appId: wxConfig.appId,
            mchId: wxConfig.mchId,
            apiKey: wxConfig.apiKey,
            notifyUrl: wxConfig.notifyUrl || `${process.env.NEXT_PUBLIC_APP_URL}/api/payment/wechat/notify`
        });

        // 4. Call UnifiedOrder
        // Amount is stored as 'amount' in DB (USD), but create-order logic might have handled CNY conversion?
        // Wait, create-order sets unitAmount in route logic but only stores 'amount' (price) in DB.
        // It does NOT store the calculated unitAmount (CNY fen) in the DB explicitly unless in metadata?
        // Let's check create-order again.
        // create-order stores 'amount' which is pkg.price (USD).
        // It calculates unitAmount (CNY) for Stripe/WeChat but doesn't save it to DB.
        // So we need to re-calculate it here using the same logic (CNY_PRICES).
        
        const CNY_PRICES = {
            'basic': 19.8,
            'pro': 69.8,
            'max': 298.8,
        };
        // @ts-ignore
        const cnyPrice = CNY_PRICES[order.package_id];
        if (!cnyPrice) return NextResponse.json({ error: 'Invalid package price' }, { status: 400 });
        
        const totalFee = Math.round(cnyPrice * 100); // Fen

        const result = await wxPay.unifiedOrder({
            body: `Credits Recharge - ${order.package_id}`,
            out_trade_no: order.id.replace(/-/g, ''), // WeChat max 32 chars, UUID is 36. Remove dashes = 32.
            total_fee: totalFee,
            spbill_create_ip: headersList.get('x-forwarded-for') || '127.0.0.1',
            product_id: order.package_id
        });

        if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
            return NextResponse.json({ 
                code_url: result.code_url,
                out_trade_no: result.out_trade_no
            });
        } else {
            console.error('WeChat Pay UnifiedOrder Failed:', result);
            return NextResponse.json({ error: result.err_code_des || result.return_msg }, { status: 400 });
        }

    } catch (e) {
        console.error('WeChat Pay API Error:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
