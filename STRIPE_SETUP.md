# Stripe Setup Guide

Step-by-step instructions for configuring Stripe payments for the Great Boss Workshop.

## Architecture Overview

The site uses **Stripe as the source of truth** for workshop sessions. Each workshop date is a separate Stripe Product with metadata that controls what appears on the site. No code changes or redeploys are needed to add, remove, or modify sessions.

### How It Works

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Site loads   │────>│ GET /api/        │────>│ Stripe API  │
│  pricing      │     │ list-sessions    │     │ Products +  │
│  section      │     │                  │<────│ Prices      │
│               │<────│ Returns sessions │     └─────────────┘
└──────┬───────┘     └──────────────────┘
       │ User selects date + payment method
       v
┌──────────────┐     ┌──────────────────┐     ┌─────────────┐
│ Click "Pay"  │────>│ POST /api/       │────>│ Stripe      │
│              │     │ create-checkout- │     │ Checkout    │
│              │     │ session          │     │ (hosted)    │
│              │     │ - checks capacity│     └──────┬──────┘
│              │     │ - creates session│            │
└──────────────┘     └──────────────────┘            │
                                                     │ Payment completes
       ┌─────────────────────────────────────────────┘
       v
┌──────────────┐     ┌──────────────────┐     ┌─────────────┐
│ /success     │     │ POST /api/       │────>│ Resend API  │
│ page         │     │ stripe-webhook   │     │ (email)     │
│              │     │ - verifies sig   │     └─────────────┘
│              │     │ - sends email    │
└──────────────┘     └──────────────────┘
```

### Key Behaviors

- **Sessions from Stripe**: The site fetches active products with `workshop_type=great_boss` metadata on every page load. No session data is stored in the codebase.
- **Auto-hide past dates**: Sessions whose `session_date` is before today are automatically excluded.
- **Capacity management**: Each product has a `max_seats` metadata field. The system counts completed, non-refunded checkout sessions against that limit.
- **Sold-out detection**: Automatic — when sold seats equal `max_seats`, the session shows "Sold out" and checkout is blocked.
- **Refund handling**: Fully refunded or canceled payments free up the seat automatically. Partial refunds do not (the attendee is still expected to attend).

## Prerequisites

- A Stripe account at [stripe.com](https://stripe.com)
- Access to the Netlify dashboard for this site
- A Resend account at [resend.com](https://resend.com) (free tier: 100 emails/day)

## Step 1: Enable ACH Direct Debit

1. Log in to [Stripe Dashboard](https://dashboard.stripe.com)
2. Go to **Settings** > **Payment Methods**
3. Find **US bank account (ACH Direct Debit)** and enable it

## Step 2: Create Workshop Products

Each workshop date is a **separate Stripe Product** with specific metadata.

### Create a Product

1. Go to **Product catalog** in the Stripe Dashboard
2. Click **+ Add Product**
3. Fill in:
   - **Name**: `Great Boss Workshop — April 15, 2026` (or your date)
   - **Description**: `Full-day EOS leadership workshop with Roy Getz, Expert EOS Implementer`

4. Add **metadata** (scroll to "Additional options" or "Metadata" section):

| Key | Value | Description |
|-----|-------|-------------|
| `workshop_type` | `great_boss` | Required — identifies this as a workshop product |
| `session_date` | `2026-04-15` | Required — ISO date, used for sorting and auto-hiding past dates |
| `session_display` | `Tuesday, April 15, 2026` | Required — human-readable date shown on the site |
| `max_seats` | `25` | Required — capacity limit for this session |
| `location` | `Columbus, OH` | Optional — shown on session cards and hero. Defaults to `Columbus, OH`. Can be a city, venue name, or `Online` |
| `time` | `9:00 AM – 4:00 PM ET` | Optional — defaults to `9:00 AM – 4:00 PM ET` |

### Add Prices to the Product

Each product needs **two one-time prices** with `payment_type` metadata:

**Price 1: ACH / Bank Transfer**
- **Amount**: `$950.00`
- **Type**: One time
- **Metadata**: `payment_type` = `ach`

**Price 2: Credit/Debit Card**
- **Amount**: `$979.00`
- **Type**: One time
- **Metadata**: `payment_type` = `card`

### Via Stripe CLI (alternative)

```bash
# Create product
stripe products create \
  --name "Great Boss Workshop — April 15, 2026" \
  --description "Full-day EOS leadership workshop with Roy Getz" \
  -d "metadata[workshop_type]=great_boss" \
  -d "metadata[session_date]=2026-04-15" \
  -d "metadata[session_display]=Tuesday, April 15, 2026" \
  -d "metadata[max_seats]=25" \
  -d "metadata[location]=Columbus, OH" \
  -d "metadata[time]=9:00 AM – 4:00 PM ET"

# Note the product ID (prod_xxx), then create prices:
stripe prices create -d "product=prod_xxx" -d "unit_amount=95000" -d "currency=usd" -d "metadata[payment_type]=ach"
stripe prices create -d "product=prod_xxx" -d "unit_amount=97900" -d "currency=usd" -d "metadata[payment_type]=card"
```

## Step 3: Get API Keys

1. Go to **Developers** > **API keys** in Stripe Dashboard
2. Copy your **Publishable key** (starts with `pk_test_` or `pk_live_`)
3. Copy your **Secret key** — click **Reveal test key** (starts with `sk_test_` or `sk_live_`)

> Start with **test mode** keys first. Toggle "Test mode" in the top-right of the Stripe Dashboard.

## Step 4: Set Environment Variables in Netlify

1. Log in to [Netlify](https://app.netlify.com)
2. Go to your site > **Site configuration** > **Environment variables**
3. Add the following variables:

| Variable | Value | Example |
|----------|-------|---------|
| `STRIPE_SECRET_KEY` | Your Stripe secret key | `sk_test_abc123...` |
| `PUBLIC_STRIPE_PUBLISHABLE_KEY` | Your Stripe publishable key | `pk_test_xyz789...` |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret | `whsec_abc123...` |
| `PUBLIC_SITE_URL` | Your site URL | `https://greatbossworkshop.com` |
| `RESEND_API_KEY` | Your Resend API key | `re_abc123...` |
| `EMAIL_FROM` | Sender address (verified domain) | `Great Boss Workshop <workshop@greatbossworkshop.com>` |
| `PUBLIC_POSTHOG_KEY` | PostHog project API key (optional) | `phc_abc123` |

> Note: Price IDs are **not** configured as env vars — they are automatically discovered from the Stripe product.

4. Click **Save** and trigger a redeploy

## Step 5: Webhook Setup (Required)

Webhooks handle post-purchase confirmation emails.

1. In Stripe Dashboard, go to **Developers** > **Webhooks**
2. Click **+ Add endpoint**
3. Enter your endpoint URL: `https://greatbossworkshop.com/api/stripe-webhook`
4. Select events to listen for:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
5. Copy the **Signing secret** (starts with `whsec_`)
6. Add it as `STRIPE_WEBHOOK_SECRET` in Netlify environment variables

### ACH Payment Events

ACH (bank transfer) payments are asynchronous — they take 4–5 business days to settle:

- `checkout.session.completed` fires immediately (payment initiated). The confirmation email is sent at this point.
- `checkout.session.async_payment_succeeded` fires when funds clear.
- `checkout.session.async_payment_failed` fires if the ACH transfer fails (logged for admin review).

Card payments complete instantly — only `checkout.session.completed` fires.

## Step 6: Email Setup (Resend)

Confirmation emails are sent via [Resend](https://resend.com) when the webhook processes a completed checkout.

1. Create a free account at [resend.com](https://resend.com)
2. Add and verify your sending domain (e.g., `greatbossworkshop.com`)
3. Create an API key
4. Set `RESEND_API_KEY` and `EMAIL_FROM` in Netlify environment variables

The confirmation email includes:
- Workshop date, time, and location (with Google Maps link)
- Instructor details
- Amount paid
- Next steps

## Step 7: Test the Payment Flow

1. Make sure Stripe is in **test mode**
2. Create at least one test product with the metadata above
3. Visit your site and select a workshop date
4. Test both payment methods:

### Test Card Payment
- Card number: `4242 4242 4242 4242`
- Expiry: Any future date (e.g., `12/34`)
- CVC: Any 3 digits (e.g., `123`)
- ZIP: Any 5 digits (e.g., `12345`)

### Test ACH Payment
- Stripe will show a test bank selector
- Select **"Test (Non-OAuth)"** and authorize

5. After payment, you should land on the `/success` page
6. Check your email for the confirmation
7. Check **Payments** in Stripe Dashboard to confirm

## Step 8: Go Live

1. In Stripe Dashboard, switch **off** test mode
2. Copy your **live** API keys (Publishable + Secret)
3. Create your workshop products in live mode with the same metadata
4. Create a live webhook endpoint with the same URL and events
5. Update Netlify environment variables with live keys and webhook secret
6. Redeploy the site

## Managing Workshop Sessions

All session management happens in the **Stripe Dashboard** — no code changes or deploys needed.

### Add a New Session

1. Go to **Product catalog** > **+ Add Product**
2. Set the name, description, metadata (`workshop_type`, `session_date`, `session_display`, `max_seats`)
3. Add two prices with `payment_type` metadata (`ach` and `card`)
4. The session appears on the site immediately

### Change Pricing for a Session

1. Find the product in Stripe
2. Deactivate the old price(s)
3. Add new price(s) with the correct `payment_type` metadata
4. The site picks up the new prices on the next page load

### Cancel / Remove a Session

- **Archive the product** in Stripe — it disappears from the site immediately
- Existing purchasers will need manual communication about cancellation/refunds

### Past Sessions

Sessions whose `session_date` is before today are **automatically hidden** — no action needed.

### Adjust Capacity

1. Find the product in Stripe
2. Edit the `max_seats` metadata value
3. Takes effect immediately on the next page load

### Process a Refund

1. Go to **Payments** in Stripe Dashboard
2. Find the payment and click **Refund**
3. Issue a full refund — the seat automatically becomes available again
4. Partial refunds do **not** free the seat (the attendee is still expected)

## Capacity & Sold-Out Logic

The system counts tickets by iterating completed Stripe checkout sessions and matching them to prices belonging to each product.

**A seat is counted as sold when:**
- The checkout session status is `complete`
- The payment intent is not `canceled`
- The charge is not fully `refunded`

**A seat is freed when:**
- A full refund is issued (via Stripe Dashboard or API)
- The payment intent is canceled

**Sold-out behavior:**
- When `sold >= max_seats`, the session card shows "Sold out" (grayed out, non-clickable)
- If a user somehow reaches the checkout endpoint, it returns HTTP 409
- There is no manual "sold out" toggle — it's fully automatic

**Race conditions:** Two users could check capacity simultaneously, both see 1 spot, and both purchase. At 25-seat scale this is extremely unlikely. If it happens, you'd handle the extra attendee manually.

## Local Development

### Setup

```bash
cp .env.example .env
# Fill in your Stripe test keys in .env
```

### Running Locally

Three terminals:

```bash
# Terminal 1: Stripe webhook forwarding
stripe listen --forward-to localhost:8888/api/stripe-webhook

# Terminal 2: Dev server
npx netlify dev

# Terminal 3: Test API endpoints
curl http://localhost:8888/api/list-sessions
```

### Testing Webhook Locally

```bash
# Trigger a test event
stripe trigger checkout.session.completed
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/list-sessions` | GET | Returns all upcoming workshop sessions with capacity info |
| `/api/create-checkout-session` | POST | Creates a Stripe Checkout session. Body: `{ productId, paymentMethod }` |
| `/api/stripe-webhook` | POST | Receives Stripe webhook events (signature-verified) |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No sessions showing on the site | Ensure products have `workshop_type=great_boss` metadata and `session_date` is in the future |
| "Failed to create checkout session" | Check that `STRIPE_SECRET_KEY` is set correctly in Netlify |
| ACH option not showing in Stripe Checkout | Ensure ACH is enabled in Stripe Settings > Payment Methods |
| Payment succeeds but wrong redirect | Check `PUBLIC_SITE_URL` env var matches your domain |
| Confirmation email not sending | Check `RESEND_API_KEY` and `EMAIL_FROM` are set. Verify domain in Resend |
| "Sold Out" but tickets remain | Check the `max_seats` metadata on the product. A refund may not have processed yet |
| Prices showing as `--` on the site | Ensure prices have `payment_type` metadata (`ach` or `card`) |
| Session not disappearing after date passed | The site checks `session_date` against today's date — clear browser cache |

## Fee Summary

| Method | Stripe Fee | Cost on $950 | You Keep |
|--------|------------|--------------|----------|
| ACH (Bank Transfer) | 0.8% capped at $5 | $5.00 | $945.00 |
| Credit/Debit Card | 2.9% + $0.30 | $27.85 | $951.15* |

*Card customers pay $979, so after the $27.85 fee you keep $951.15 — effectively recovering the processing cost.
