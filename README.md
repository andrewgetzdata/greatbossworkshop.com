# greatbossworkshop.com

Landing page and ticket sales for the Great Boss Workshop, a full-day EOS leadership workshop led by Roy Getz.

## Tech Stack

- **Astro 5** — static site generator
- **Tailwind CSS 4** — styling
- **React 19** — interactive components
- **Netlify Functions** — serverless API endpoints
- **Stripe** — payment processing + session/product management
- **Resend** — transactional confirmation emails
- **PostHog** — analytics (optional)

## How It Works

Workshop sessions are managed entirely through **Stripe Products**. Each workshop date is a Stripe Product with metadata that the site reads at runtime. No code changes or deploys are needed to add, modify, or remove sessions.

### Purchase Flow

1. Visitor loads the site — the pricing section fetches available sessions from Stripe via `/api/list-sessions`
2. Visitor selects a date, then chooses Bank Transfer (ACH, $950) or Card ($979)
3. `/api/create-checkout-session` validates capacity, creates a Stripe Checkout session, and redirects to Stripe's hosted payment page
4. After payment, Stripe redirects to `/success` with session details
5. Stripe sends a webhook to `/api/stripe-webhook`, which verifies the signature and sends a confirmation email via Resend

### Capacity & Sold-Out

- Each product has a `max_seats` metadata field (default: 25)
- The system counts completed, non-refunded checkout sessions per product
- When seats are full, the session shows "Sold out" and checkout is blocked
- Full refunds automatically free up the seat

### Session Lifecycle

- **Future + active product** → shown as available, purchasable
- **Future + sold out** → shown as "Sold out", grayed out
- **Past date** → automatically hidden (no action needed)
- **Archived product** → hidden immediately

## Project Structure

```
src/
  components/     # Astro components (Hero, Pricing, FAQ, etc.)
  data/           # workshop.json (static content: instructor, agenda, FAQs)
  layouts/        # Base HTML layout with SEO/JSON-LD
  pages/          # index.astro, success.astro
  styles/         # Global CSS

netlify/
  functions/
    create-checkout-session.ts  # Creates Stripe Checkout session with capacity check
    list-sessions.ts            # Fetches workshop sessions from Stripe products
    stripe-webhook.ts           # Handles payment webhooks, sends confirmation email
    lib/
      stripe.ts                 # Shared Stripe client, session fetching, capacity logic
      email.ts                  # Confirmation email template (Resend)
```

## Local Development

```bash
npm install
cp .env.example .env
# Fill in Stripe test keys (see STRIPE_SETUP.md)

# Terminal 1: webhook forwarding
stripe listen --forward-to localhost:8888/api/stripe-webhook

# Terminal 2: dev server
npx netlify dev
```

Site runs at `http://localhost:8888`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Yes | Stripe secret API key |
| `PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | Stripe publishable key (safe for client) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Webhook signing secret |
| `PUBLIC_SITE_URL` | Yes | Site URL for redirects |
| `RESEND_API_KEY` | Yes | Resend email API key |
| `EMAIL_FROM` | Yes | Sender address (must match verified Resend domain) |
| `PUBLIC_POSTHOG_KEY` | No | PostHog analytics key |
| `PUBLIC_POSTHOG_HOST` | No | PostHog API host |

## Managing Sessions

All done in the Stripe Dashboard — see [STRIPE_SETUP.md](./STRIPE_SETUP.md) for full instructions.

**Add a session:** Create a product with `workshop_type=great_boss` metadata, add ACH + card prices.

**Remove a session:** Archive the product in Stripe.

**Adjust capacity:** Edit the `max_seats` metadata on the product.

**Change pricing:** Deactivate old prices, add new ones with `payment_type` metadata.

## Testing

### Prerequisites

- Stripe CLI installed and authenticated (`stripe login`)
- `npx netlify dev` running on port 8888
- `stripe listen --forward-to localhost:8888/api/stripe-webhook` running

### Test Cases

#### 1. Sold-Out Flow

Verify that sold-out sessions cannot be purchased.

1. Set `max_seats=0` on a product: `stripe products update prod_xxx -d "metadata[max_seats]=0"`
2. Force a cache refresh: `curl http://localhost:8888/api/list-sessions?fresh=1`
3. Verify `list-sessions` returns `status=sold_out` and `soldOut=true` for that session
4. Verify `create-checkout-session` returns **HTTP 409** with `{"error":"sold_out","remaining":0}`
5. On the site, verify the session card is grayed out and non-clickable
6. Restore seats: `stripe products update prod_xxx -d "metadata[max_seats]=25"`

#### 2. Refund Flow

Verify that refunded payments free up seats.

1. Complete a test purchase through the site (use test card `4242 4242 4242 4242`)
2. Note the seat count decreases by 1
3. In Stripe Dashboard, go to Payments, find the payment, click **Refund** (full refund)
4. Force a cache refresh and verify the seat count goes back up
5. The session should no longer show as sold out (if it was at capacity)

The system checks `payment_intent.status === "canceled"` and `charge.refunded === true` to exclude refunded purchases from the count.

#### 3. Caching & Background Refresh

Verify the two-layer cache works correctly.

1. Force a fresh load: `curl http://localhost:8888/api/list-sessions?fresh=1` (slow, ~5-12s)
2. Immediately request again: `curl http://localhost:8888/api/list-sessions` (fast, <0.05s)
3. On the site, the pricing section should load instantly with cached data
4. After a moment, seat counts silently update via a background `?fresh=1` request
5. Cache TTL is 1 hour — after that, the next request hits Stripe again

#### 4. Mobile Layout

Verify responsive layout at narrow widths (<640px).

1. Open the site and resize browser to mobile width (or use DevTools device toolbar)
2. **Date selector**: Should stack to single column (default `grid-cols-1`, desktop `sm:grid-cols-3`)
3. **What's Included**: Should stack to single column (default `grid-cols-1`, desktop `sm:grid-cols-2`)
4. **Payment buttons**: Should stack to single column (default `grid-cols-1`, desktop `sm:grid-cols-2`)
5. All text should remain readable and buttons should be full-width

#### 5. Online Session Display

Verify online sessions render differently from in-person sessions.

1. Create a product with `location=Online` and `webinar_url=https://zoom.us/j/123456789`
2. Verify the session card on the site shows "Online" as the location
3. Complete a test purchase for the online session
4. Verify the confirmation email says "Join link" instead of a physical address
5. Verify the success page shows "Online — Join link" instead of a maps link
6. Verify the email omits "lunch are provided" for online sessions

#### 6. Webhook & Email

Verify the webhook processes events and sends confirmation emails.

1. Ensure `stripe listen` is running and forwarding to localhost
2. Complete a test purchase on the site
3. Check the `stripe listen` terminal — should show `checkout.session.completed` with **200** response
4. Check the `netlify dev` terminal — should show "Confirmation email sent to [email]"
5. Check the recipient's inbox (or Resend dashboard) for the confirmation email
6. Email should include: correct session date, venue/address with maps link, instructor, amount paid

#### 7. Admin Dashboard

Verify the admin page shows attendee data.

1. Go to `http://localhost:8888/admin`
2. Enter the `ADMIN_API_KEY` value as the password
3. Session cards should appear in the sidebar with date, location, and seat counts
4. Click a session — attendee table should load with name, email, amount, method, date, status
5. Click **Export CSV** — should download a CSV file with attendee data
6. Click **Sign out** — should return to login screen

#### 8. Grid Fill (Coming Soon Placeholders)

Verify incomplete grid rows are filled with "Coming soon" cards.

1. Ensure the number of active sessions is not divisible by 3
2. Verify the last row has dashed-border "TBD / Coming soon" placeholder cards filling the remaining slots
3. Placeholders should not be clickable

### Test Card Numbers

| Card | Result |
|------|--------|
| `4242 4242 4242 4242` | Successful payment |
| `4000 0000 0000 9995` | Declined (insufficient funds) |
| `4000 0000 0000 3220` | 3D Secure authentication required |

For ACH testing, select **"Test (Non-OAuth)"** in the bank selector.

## Deployment

Hosted on Netlify. Pushes to `main` trigger auto-deploy.

```bash
npm run build   # Outputs to dist/
```
