import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { sendEmail } from '@/lib/resend';
import { EmailTemplates } from '@/lib/emailTemplates';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // if "next" is in param, use it as the redirect URL
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = getSupabaseServer();
    if (supabase) {
      const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && session && session.user) {
        // Successful login/signup
        const user = session.user;
        const userId = user.id;
        const email = user.email;

        // Check if welcome email has been sent
        // We use notification_logs to track this
        const { count } = await supabase
          .from('notification_logs')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('type', 'welcome');

        if (count === 0 && email) {
            // Send welcome email
            const name = user.user_metadata?.name || user.user_metadata?.full_name || email.split('@')[0];
            
            // We don't await this to avoid delaying the redirect
            // But for reliability we might want to? 
            // Vercel serverless might kill the process if we don't await.
            // Let's await it.
            await sendEmail({
                to: email,
                subject: 'Welcome to Yundian+ - 30 Free Credits Inside! 🎁',
                html: EmailTemplates.welcome(name),
                userId: userId,
                type: 'welcome'
            }).catch(e => console.error('Failed to send welcome email:', e));
        }
      }
    }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(`${origin}${next}`);
}
