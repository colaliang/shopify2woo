import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { WeChatPay } from '@/lib/wechatPay';
import { parseStringPromise } from 'xml2js';

export async function POST(req: Request) {
    try {
        const xmlBody = await req.text();
        
        // 1. Parse XML
        const result = await parseStringPromise(xmlBody, {
            explicitArray: false,
            ignoreAttrs: true
        });
        const data = result.xml || result;

        // 2. Load Config to Verify Signature
        const supabase = getSupabaseServer();
        if (!supabase) {
             console.error('Supabase not available for WeChat Notify');
             return new NextResponse('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[System Error]]></return_msg></xml>');
        }

        const { data: configData } = await supabase
            .from('system_configs')
            .select('value')
            .eq('key', 'wechat_pay_config')
            .single();

        if (!configData?.value) {
            console.error('WeChat Config not found during notify');
             return new NextResponse('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[Config Error]]></return_msg></xml>');
        }

        const wxPay = new WeChatPay(configData.value);

        // 3. Verify Signature
        if (!wxPay.checkSignature(data)) {
            console.error('WeChat Notify Signature Verification Failed', data);
            return new NextResponse('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[Sign Error]]></return_msg></xml>');
        }

        // 4. Check Payment Status
        if (data.return_code === 'SUCCESS' && data.result_code === 'SUCCESS') {
            // Success!
            // data.out_trade_no is our Order ID (without dashes)
            // We need to match it.
            // Since we stripped dashes, we need to find the order carefully or store the stripped version.
            // Actually, querying by ID with dashes removed is hard in UUID column.
            // Better strategy: Store the 'out_trade_no' in payment_orders when creating the order? 
            // Or just try to match.
            // UUID without dashes is unique enough.
            
            const outTradeNo = data.out_trade_no;
            
            // Find order by matching ID (handling UUID format)
            // We can try to find order where replace(id, '-', '') = outTradeNo
            // But Supabase/Postgres might not index that well.
            // Alternatively, fetch the order by searching metadata if we stored it?
            // Or just loop/search? No.
            
            // Best approach: When generating out_trade_no, we stored it in 'external_order_id' or 'metadata'?
            // In 'pay/route.ts', we didn't update the order with out_trade_no.
            // Let's rely on the fact that we can reconstruct the UUID or search for it.
            // Actually, we can just assume the out_trade_no IS the UUID with dashes removed.
            // We can re-insert dashes? 8-4-4-4-12
            const orderId = `${outTradeNo.substr(0,8)}-${outTradeNo.substr(8,4)}-${outTradeNo.substr(12,4)}-${outTradeNo.substr(16,4)}-${outTradeNo.substr(20)}`;
            
            // 5. Complete Order
            const { error } = await supabase.rpc('complete_payment_order', {
                p_order_id: orderId,
                p_external_id: data.transaction_id
            });

            if (error) {
                console.error('WeChat Notify: Complete Order Failed', error);
                // Return FAIL to let WeChat retry? Or SUCCESS if it's a duplicate?
                // If error is "Already paid", we should return SUCCESS.
                if (error.message?.includes('Already paid')) {
                    return new NextResponse('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');
                }
                return new NextResponse('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[DB Error]]></return_msg></xml>');
            }
        }

        return new NextResponse('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');

    } catch (e) {
        console.error('WeChat Notify Error:', e);
        return new NextResponse('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[Exception]]></return_msg></xml>');
    }
}
