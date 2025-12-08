export const EmailTemplates = {
  orderCreated: (orderId: string, amount: number, currency: string, packageId: string) => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h1>Order Confirmation</h1>
      <p>Thank you for your order!</p>
      <div style="background: #f4f4f4; padding: 20px; border-radius: 8px;">
        <p><strong>Order ID:</strong> ${orderId}</p>
        <p><strong>Package:</strong> ${packageId}</p>
        <p><strong>Amount:</strong> ${amount} ${currency}</p>
      </div>
      <p>Please complete your payment to activate your credits.</p>
    </div>
  `,

  orderPaid: (orderId: string, credits: number) => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: green;">Payment Successful!</h1>
      <p>We have received your payment.</p>
      <div style="background: #f4f4f4; padding: 20px; border-radius: 8px;">
        <p><strong>Order ID:</strong> ${orderId}</p>
        <p><strong>Credits Added:</strong> ${credits}</p>
      </div>
      <p>You can now start importing products.</p>
      <a href="https://www.ydplus.net" style="display: inline-block; background: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
    </div>
  `,

  welcome: (name: string) => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h1>Welcome to Yundian+WordPress Products Import Assistant!</h1>
      <p>Hi ${name},</p>
      <p>Thanks for signing up. We're excited to help you migrate your products.</p>
    </div>
  `
};
