import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/resend';
import { EmailTemplates } from '@/lib/emailTemplates';
import { getSupabaseServer } from '@/lib/supabaseServer';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    const type = searchParams.get('type') || 'welcome';

    if (!email) {
      return NextResponse.json({ error: 'Missing email param' }, { status: 400 });
    }

    // Optional: check auth
    const supabase = getSupabaseServer();
    let userId = undefined;
    if (supabase) {
        // Try to find user by email
        // Note: Direct access to auth.users might fail depending on permissions, but we can try
        const { data } = await supabase.from('auth.users').select('id').eq('email', email).single();
        if (data) {
             userId = data.id;
        }
    }

    let html = '';
    if (type === 'order_created') {
        html = EmailTemplates.orderCreated('TEST-ORDER-123', 9.99, 'USD', 'Pro Package');
    } else if (type === 'order_paid') {
        html = EmailTemplates.orderPaid('TEST-ORDER-123', 1500);
    } else {
        html = EmailTemplates.welcome('Tester');
    }

    const result = await sendEmail({
      to: email,
      subject: `Test Email: ${type}`,
      html,
      userId,
      type: type as 'welcome' | 'order_created' | 'order_paid',
      metadata: { test: true }
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
