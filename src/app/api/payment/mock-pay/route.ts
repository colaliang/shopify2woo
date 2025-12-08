import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('orderId');
  const method = searchParams.get('method');

  if (!orderId) return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });

  // This is a MOCK payment page/handler
  // In real life, Stripe returns a URL, WeChat returns a Code URL.
  // Here we just simulate a "Confirm Payment" page or auto-success.

  // NOTE: In production, the webhook call should originate from the payment provider server,
  // not from the client browser. For this mock, we are calling the webhook from the browser,
  // so we need to expose the secret to the client, WHICH IS UNSAFE.
  // BUT since this is a MOCK gateway, it's acceptable for testing environment only.
  // We will inject the secret into the HTML if it exists.
  
  const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || '';

  return new NextResponse(`
    <html>
      <head><title>Mock Payment Gateway</title></head>
      <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh;">
        <h1>Mock Payment Gateway (${method})</h1>
        <p>Order ID: ${orderId}</p>
        <button onclick="pay()" style="padding: 10px 20px; font-size: 18px; background: green; color: white; border: none; border-radius: 5px; cursor: pointer;">
          Confirm Payment (Success)
        </button>
        <script>
          async function pay() {
            const headers = { 'Content-Type': 'application/json' };
            const secret = '${webhookSecret}';
            if (secret) {
                headers['x-webhook-secret'] = secret;
            }
            
            const res = await fetch('/api/payment/webhook/mock', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ orderId: '${orderId}', status: 'paid' })
            });
            if (res.ok) {
                alert('Payment Successful! Closing...');
                if (window.opener) {
                    window.opener.postMessage('payment_success', '*');
                    window.close();
                } else {
                    window.location.href = '/?payment=success';
                }
            } else {
                alert('Payment Failed');
            }
          }
        </script>
      </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' },
  });
}
