import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });

    const supabase = getSupabaseServer();
    if (!supabase) return NextResponse.json({ error: 'Server Error' }, { status: 500 });

    const { data, error } = await supabase
        .from('payment_orders')
        .select('status')
        .eq('id', orderId)
        .single();

    if (error || !data) {
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({ status: data.status });
}
