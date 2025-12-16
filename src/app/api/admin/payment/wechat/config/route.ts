import { NextResponse } from 'next/server';
import { checkAdmin } from '@/lib/adminAuth';

export async function POST(req: Request) {
    const auth = await checkAdmin();
    if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    try {
        const { appId, mchId, apiKey, notifyUrl, certContent } = await req.json();

        if (!appId || !mchId || !apiKey) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const { supabase } = auth;
        if (!supabase) {
            return NextResponse.json({ error: 'DB Connection Error' }, { status: 500 });
        }

        // Save to system_configs
        const { error } = await supabase
            .from('system_configs')
            .upsert({
                key: 'wechat_pay_config',
                value: {
                    appId,
                    mchId,
                    apiKey, // In a real app, encrypt this before storing
                    notifyUrl,
                    certContent, // Base64 or string content of p12/pem
                    updated_at: new Date().toISOString()
                },
                is_secret: true,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error('Save WeChat Config Error:', e);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(req: Request) {
    const auth = await checkAdmin();
    if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { supabase } = auth;
    if (!supabase) return NextResponse.json({ error: 'DB Error' }, { status: 500 });

    const { data } = await supabase
        .from('system_configs')
        .select('value')
        .eq('key', 'wechat_pay_config')
        .single();

    if (!data || !data.value) {
        return NextResponse.json({ configured: false });
    }

    // Mask sensitive info
    const config = data.value;
    return NextResponse.json({
        configured: true,
        appId: config.appId,
        mchId: config.mchId,
        notifyUrl: config.notifyUrl,
        hasCert: !!config.certContent,
        // Don't return apiKey or certContent
    });
}
