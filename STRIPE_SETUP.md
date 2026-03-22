# Stripe Setup Guide

Step-by-step instructions for configuring Stripe payments for the Great Boss Workshop.

## Prerequisites

- A Stripe account at [stripe.com](https://stripe.com)
- Access to the Netlify dashboard for this site

## Step 1: Enable ACH Direct Debit

1. Log in to [Stripe Dashboard](https://dashboard.stripe.com)
2. Go to **Settings** > **Payment Methods**
3. Find **US bank account (ACH Direct Debit)** and enable it
4. This allows customers to pay directly from their bank account at a lower fee

## Step 2: Create Products & Prices

1. Go to **Products** in the Stripe Dashboard
2. Click **+ Add Product**
3. Create the product:
   - **Name**: `Great Boss Workshop`
   - **Description**: `Full-day EOS leadership workshop with Roy Getz, Expert EOS Implementer`
4. Add **two prices** to this product:

### Price 1: ACH / Bank Transfer
- Click **Add another price**
- **Price**: `$1,095.00`
- **Billing period**: One time
- **Price description**: `Bank Transfer (ACH)`
- Copy the **Price ID** (starts with `price_`) — you'll need this

### Price 2: Credit/Debit Card
- Click **Add another price**
- **Price**: `$1,128.00`
- **Billing period**: One time
- **Price description**: `Credit/Debit Card (includes 3% processing fee)`
- Copy the **Price ID** (starts with `price_`) — you'll need this

## Step 3: Get API Keys

1. Go to **Developers** > **API keys** in Stripe Dashboard
2. Copy your **Publishable key** (starts with `pk_test_` or `pk_live_`)
3. Copy your **Secret key** (starts with `sk_test_` or `sk_live_`)

> Start with **test mode** keys first. Toggle "Test mode" in the top-right of the Stripe Dashboard.

## Step 4: Set Environment Variables in Netlify

1. Log in to [Netlify](https://app.netlify.com)
2. Go to your site > **Site configuration** > **Environment variables**
3. Add the following variables:

| Variable | Value | Example |
|----------|-------|---------|
| `STRIPE_SECRET_KEY` | Your Stripe secret key | `sk_test_abc123...` |
| `PUBLIC_STRIPE_PUBLISHABLE_KEY` | Your Stripe publishable key | `pk_test_xyz789...` |
| `STRIPE_PRICE_ID_ACH` | Price ID for ACH ($1,095) | `price_1Abc...` |
| `STRIPE_PRICE_ID_CARD` | Price ID for Card ($1,128) | `price_1Xyz...` |
| `PUBLIC_SITE_URL` | Your site URL | `https://greatbossworkshop.com` |
| `PUBLIC_POSTHOG_KEY` | PostHog project API key (optional) | `phc_abc123` |

4. Click **Save** and trigger a redeploy

## Step 5: Test the Payment Flow

1. Make sure Stripe is in **test mode** (toggle in Dashboard top-right)
2. Visit your site and click "Pay by Bank Transfer" or "Pay by Card"
3. Use these test credentials:

### Test Card Payment
- Card number: `4242 4242 4242 4242`
- Expiry: Any future date (e.g., `12/34`)
- CVC: Any 3 digits (e.g., `123`)
- ZIP: Any 5 digits (e.g., `12345`)

### Test ACH Payment
- Stripe will show a test bank account selector
- Select "Test Institution" and authorize

4. After payment, you should land on the `/success` page
5. Check **Payments** in Stripe Dashboard to confirm the test payment appeared

## Step 6: Go Live

1. In Stripe Dashboard, switch **off** test mode
2. Copy your **live** API keys (Publishable + Secret)
3. Create the same two Prices in live mode (or they may already exist)
4. Update the Netlify environment variables with live keys and Price IDs
5. Redeploy the site

## Step 7: Webhook Setup (Optional)

Webhooks let you automate post-purchase actions (confirmation emails, attendee tracking).

1. In Stripe Dashboard, go to **Developers** > **Webhooks**
2. Click **+ Add endpoint**
3. Enter your endpoint URL: `https://greatbossworkshop.com/api/stripe-webhook`
4. Select events to listen for: `checkout.session.completed`
5. Copy the **Signing secret** (starts with `whsec_`)
6. Add it as `STRIPE_WEBHOOK_SECRET` in Netlify environment variables

> Note: The webhook endpoint is not yet implemented. This is a future enhancement for automating confirmation emails.

## Updating for the Next Workshop

To set up a new workshop date:

1. Edit `src/data/workshop.json`:
   - Update `date`, `dateDisplay`, and `time`
   - Update pricing if needed
   - Update testimonials with real quotes
2. If pricing changes, create new Prices in Stripe and update the Price ID env vars
3. Commit and push — Netlify will auto-deploy

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Failed to create checkout session" | Check that all env vars are set correctly in Netlify |
| ACH option not showing in Stripe Checkout | Ensure ACH is enabled in Stripe Settings > Payment Methods |
| Payment succeeds but no redirect | Check `PUBLIC_SITE_URL` env var matches your domain |
| Test payments not appearing | Make sure you're using test mode keys, not live keys |

## Fee Summary

| Method | Fee | Cost on $1,095 | You Keep |
|--------|-----|-----------------|----------|
| ACH (Bank Transfer) | 0.8% capped at $5 | $5.00 | $1,090.00 |
| Credit/Debit Card | 2.9% + $0.30 | $32.06 | $1,095.94* |

*Card customers pay $1,128, so after the $32.06 fee you keep $1,095.94 — effectively recovering the processing cost.
