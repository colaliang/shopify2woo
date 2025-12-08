import { Resend } from 'resend';
import { getSupabaseServer } from './supabaseServer';

const resend = new Resend(process.env.RESEND_API_KEY);

export type EmailType = 'order_created' | 'order_paid' | 'welcome';

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  userId?: string;
  type: EmailType;
  metadata?: Record<string, unknown>;
}

export async function sendEmail({ to, subject, html, userId, type, metadata }: SendEmailParams) {
  try {
    // 1. Check User Subscription Preferences (if userId provided)
    if (userId) {
      const supabase = getSupabaseServer();
      if (supabase) {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('status, preferences')
          .eq('user_id', userId)
          .single();

        // If unsubscribed globally, block marketing but maybe allow transactional?
        // For now, let's assume 'order_*' are transactional and always go through unless hard bounced.
        // If it's marketing, check status.
        if (type === 'welcome' && sub?.status === 'unsubscribed') {
          console.log(`User ${userId} unsubscribed, skipping ${type} email.`);
          return { success: false, reason: 'unsubscribed' };
        }
      }
    }

    // 2. Send Email
    const { data, error } = await resend.emails.send({
      from: '云店+WordPress产品导入助手 <sys@ydplus.net>', // Change to your verified domain
      to,
      subject,
      html,
    });

    if (error) {
      console.error('Resend Error:', error);
      await logNotification(userId, type, 'failed', undefined, error.message, metadata);
      return { success: false, error };
    }

    // 3. Log Success
    await logNotification(userId, type, 'sent', data?.id, undefined, metadata);
    return { success: true, data };

  } catch (error) {
    console.error('Send Email Exception:', error);
    await logNotification(userId, type, 'failed', undefined, error instanceof Error ? error.message : String(error), metadata);
    return { success: false, error };
  }
}

async function logNotification(
  userId: string | undefined,
  type: string,
  status: 'sent' | 'failed',
  providerId?: string,
  errorMsg?: string,
  metadata?: unknown
) {
  try {
    const supabase = getSupabaseServer();
    if (!supabase || !userId) return;

    await supabase.from('notification_logs').insert({
      user_id: userId,
      type,
      status,
      provider_id: providerId,
      error: errorMsg,
      metadata
    });
  } catch (e) {
    console.error('Failed to log notification:', e);
  }
}
