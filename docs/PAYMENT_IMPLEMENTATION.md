# Stripe Payment Implementation Documentation

## 1. Overview
This document details the implementation of the Stripe payment flow in the `shopify2woo-web` application. The integration allows users to purchase credit packages using Credit Cards, Alipay, and PayPal via Stripe Checkout.

## 2. Configuration
### Environment Variables
The following environment variables are required in `.env.local`:
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: Stripe Publishable Key (starts with `pk_test_` or `pk_live_`).
- `STRIPE_SECRET_KEY`: Stripe Secret Key (starts with `sk_test_` or `sk_live_`).
- `STRIPE_WEBHOOK_SECRET`: Stripe Webhook Signing Secret (starts with `whsec_`).

### Dependencies
- `stripe`: Node.js SDK for Stripe (Version matching `2025-11-17.clover` API).
- `@stripe/stripe-js` (optional, used if client-side Elements were implemented, but we use Checkout).

### PayPal Configuration
- To use PayPal with Stripe, you must enable PayPal in your [Stripe Dashboard Payment Methods settings](https://dashboard.stripe.com/settings/payment_methods).
- Ensure your Stripe account is eligible and configured for PayPal processing.

## 3. Implementation Details

### 3.1. Payment Initiation (`/api/payment/create-order`)
- **Method**: `POST`
- **Input**: `{ packageId: string, paymentMethod: 'stripe' }`
- **Process**:
    1. Authenticates the user.
    2. Validates the package selection.
    3. Creates a `payment_orders` record in Supabase with status `pending`.
    4. Creates a Stripe Checkout Session:
        - Mode: `payment`
        - Payment Method Types: `['card', 'alipay', 'paypal']`
        - Line Items: Corresponds to the selected package.
        - Metadata: Stores `orderId`, `userId`, `packageId`, `credits`.
        - Success/Cancel URLs: Points to `/payment/result`.
    5. Returns `paymentUrl` (Stripe Checkout URL).

### 3.2. Payment Completion (Webhook) (`/api/payment/webhook/stripe`)
- **Method**: `POST`
- **Process**:
    1. Verifies the Stripe signature using `STRIPE_WEBHOOK_SECRET`.
    2. Listens for `checkout.session.completed` event.
    3. Extracts `orderId` from metadata.
    4. Calls Supabase RPC `complete_payment_order` to:
        - Update order status to `paid`.
        - Record external transaction ID.
        - Add credits to the user's account.

### 3.3. Frontend Handling (`RechargeModal.tsx` & `/payment/result`)
- The modal calls the create-order API and opens the returned `paymentUrl` in a popup.
- The `/payment/result` page handles the redirect from Stripe:
    - If successful, sends a `postMessage('payment_success')` to the opener window.
    - Closes itself after a countdown.
- The modal listens for the message, refreshes user credits, and closes.

## 4. Testing & Verification

### 4.1. Unit/Integration Tests
- **Build Verification**: The project builds successfully (`npm run build`).
- **Configuration Check**: Verified presence of Stripe keys in environment.

### 4.2. End-to-End Test Plan (Sandbox)

Since you are using Sandbox keys, you can test the full flow locally.

**Prerequisites:**
1. Ensure `.env.local` contains the correct keys (`pk_test_...` and `sk_test_...`).
2. Install Stripe CLI (optional but recommended for Webhook testing).

**Steps:**
1. **Initiate Payment**:
   - Run the dev server: `npm run dev`
   - Open the application and navigate to the Recharge Modal.
   - Select a Package and choose "Credit Card (Stripe)".
   - Click "Buy Now".
   - **Verification**: A popup should open loading the Stripe Checkout page (hosted by Stripe).

2. **Complete Payment**:
   - Use one of Stripe's [Test Card Numbers](https://stripe.com/docs/testing#cards):
     - **Card Number**: `4242 4242 4242 4242`
     - **Expiry**: Any future date (e.g., `12/34`)
     - **CVC**: Any 3 digits (e.g., `123`)
   - Click "Pay".
   - **Verification**: 
     - You should be redirected to the success page (`/payment/result`).
     - The success page should auto-close and notify the main window.
     - The main window should display "Recharge Successful".

3. **Webhook Verification (Crucial for Credit Updates)**:
   - **Note**: Without a Webhook Secret (`STRIPE_WEBHOOK_SECRET`), the server cannot verify the callback, and credits **will not** be added automatically in the database.
   - **To test Webhooks locally:**
     1. Install Stripe CLI.
     2. Login: `stripe login`
     3. Forward webhooks: `stripe listen --forward-to localhost:3000/api/payment/webhook/stripe`
     4. Copy the "Webhook Signing Secret" (starts with `whsec_`) from the CLI output.
     5. Update `.env.local` with `STRIPE_WEBHOOK_SECRET=whsec_...`
     6. Restart the dev server.
     7. Perform the payment again.
     8. **Verification**: Check the CLI output for `200 OK` on the webhook event. Check the database to see if `payment_orders` status is `paid` and user credits have increased.

**Troubleshooting:**
- If you see "Webhook secret not configured" in logs, you missed step 3.
- If the payment succeeds but credits don't update, check the server console for webhook errors.


### 4.3. Refund Flow (Manual)
- Refunds are currently handled via the Stripe Dashboard.
- When a refund is issued, a `charge.refunded` event is sent.
- **Action Item**: Implement `charge.refunded` handler if automatic credit deduction is required (currently not implemented).

## 5. Security Review
- **PCI DSS**: We use Stripe Checkout, which is PCI Service Provider Level 1 certified. No card data touches our servers.
- **Data Privacy**: Only necessary metadata (User ID, Order ID) is sent to Stripe.
- **Signature Verification**: Webhooks are verified using the signing secret to prevent replay or forgery attacks.
- **Access Control**: API endpoints are protected by Supabase Auth (JWT).

## 6. Recommendations
- **Set `STRIPE_WEBHOOK_SECRET`**: Ensure this is set in production environment variables.
- **Logging**: Monitor server logs for webhook failures.
- **Alerting**: Set up alerts for 5xx errors on the payment endpoints.
