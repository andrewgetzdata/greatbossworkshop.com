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

## Deployment

Hosted on Netlify. Pushes to `main` trigger auto-deploy.

```bash
npm run build   # Outputs to dist/
```
