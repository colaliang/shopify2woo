import { NextResponse } from 'next/server';
import { getSupabaseServer, getUserIdFromToken } from '@/lib/supabaseServer';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { description, category, contact_info, token } = body;

    // 1. Validation
    if (!description || !category || !contact_info) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 2. Cloudflare Turnstile Verification
    const turnstileSecret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
    if (turnstileSecret) {
      if (!token) {
        return NextResponse.json(
          { error: 'Missing CAPTCHA token' },
          { status: 400 }
        );
      }

      const formData = new FormData();
      formData.append('secret', turnstileSecret);
      formData.append('response', token);
      formData.append('remoteip', req.headers.get('x-forwarded-for') || '');

      const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
      const result = await fetch(url, {
        body: formData,
        method: 'POST',
      });

      const outcome = await result.json();
      if (!outcome.success) {
        return NextResponse.json(
          { error: 'Invalid CAPTCHA' },
          { status: 400 }
        );
      }
    } else {
      // Mock verification if no secret key (for dev/test)
      console.warn('CLOUDFLARE_TURNSTILE_SECRET_KEY not set, skipping verification');
    }

    // 3. Get User ID (Optional)
    const authHeader = req.headers.get('Authorization');
    const authToken = authHeader?.split(' ')[1];
    const userId = await getUserIdFromToken(authToken);

    // 4. Insert into Database
    const supabase = getSupabaseServer();
    if (!supabase) {
        return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
    }

    const { error: dbError } = await supabase
      .from('contact_submissions')
      .insert({
        description,
        category,
        contact_info,
        user_id: userId,
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      });

    if (dbError) {
      console.error('Database Error:', dbError);
      return NextResponse.json(
        { error: 'Failed to save submission' },
        { status: 500 }
      );
    }

    // 5. Send Email Notification (Optional)
    if (process.env.RESEND_API_KEY) {
      try {
        const sendEmail = async (retries = 3) => {
          try {
            await resend.emails.send({
              from: '云店+ Contact <sys@ydplus.net>',
              to: ['support@ydplus.net', 'support@ydjia.com'],
              subject: `[Form Submission] ${category}`,
              html: `
                <h2>New Contact Form Submission</h2>
                <ul>
                  <li><strong>Time:</strong> ${new Date().toLocaleString('zh-CN')}</li>
                  <li><strong>Category:</strong> ${category}</li>
                  <li><strong>Contact:</strong> ${contact_info}</li>
                  <li><strong>User ID:</strong> ${userId || 'Anonymous'}</li>
                </ul>
                <h3>Description:</h3>
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; white-space: pre-wrap;">
                  ${description}
                </div>
              `,
            });
          } catch (e) {
            if (retries > 0) {
              console.warn(`Email sending failed, retrying... (${retries} left)`);
              await new Promise(r => setTimeout(r, 1000));
              await sendEmail(retries - 1);
            } else {
              throw e;
            }
          }
        };

        await sendEmail();
      } catch (emailError) {
        console.error('Failed to send notification email:', emailError);
        // We don't fail the request if email fails, but we log it.
        // Optionally log to DB if needed.
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Contact API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
