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
      <h1>Welcome to Yundian+ WordPress Product Import Assistant!</h1>
      <p>Hi ${name},</p>
      <p>Thanks for signing up! We're excited to help you migrate your products efficiently.</p>
      
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #166534;">🎁 Welcome Gift</h3>
        <p style="margin-bottom: 0; color: #15803d;">You have received <strong>30 FREE Credits</strong> to start importing products immediately!</p>
      </div>

      <h3>Key Features:</h3>
      <ul>
        <li>🚀 <strong>One-Click Import:</strong> Easily import products from Shopify, Wix, and other platforms to WooCommerce.</li>
        <li>🖼️ <strong>Image Handling:</strong> Automatic image downloading and uploading to your WordPress media library.</li>
        <li>🔄 <strong>Batch Processing:</strong> Queue multiple imports and let them run in the background.</li>
        <li>📝 <strong>Data Mapping:</strong> Intelligent mapping of titles, descriptions, prices, variants, and categories.</li>
      </ul>

      <p>Ready to get started?</p>
      <a href="https://www.ydplus.net" style="display: inline-block; background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Start Importing Now</a>
      
      <p style="margin-top: 30px; font-size: 12px; color: #666;">If you have any questions, reply to this email or check our <a href="https://www.ydplus.net/docs">documentation</a>.</p>
    </div>
  `
};
