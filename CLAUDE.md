# CLAUDE.md

Landing page and ticket sales for the Great Boss Workshop — a full-day EOS leadership workshop led by Roy Getz.

## Stack

- **Astro 5** static site, **Tailwind 4**, **React 19** (for interactive bits only)
- **Netlify Functions** (Node) for all API endpoints under `/api/*` → `netlify/functions/*.ts`
- **Stripe** is source-of-truth for sessions, pricing, capacity, and purchases (no database)
- **Resend** for confirmation emails, **PostHog** optional for analytics

No DB on purpose. Workshop sessions are Stripe Products with `workshop_type=great_boss` metadata; capacity comes from `max_seats` metadata; sold-out is computed by counting completed non-refunded sessions.

## Project layout

```
src/
  components/   Astro + one React component (StripeCheckout.tsx)
  data/         workshop.json — all static copy (instructor bio, agenda, FAQ, location, pricing defaults)
  layouts/      Layout.astro — SEO, JSON-LD, PostHog, Google Fonts
  pages/        index.astro, admin.astro, success.astro
  styles/       global.css — Tailwind theme with EOS brand tokens
netlify/
  functions/
    create-checkout-session.ts    Stripe Checkout creation + capacity check (returns 409 if sold out)
    list-sessions.ts              Fetch active future sessions; two-layer cache (1hr)
    stripe-webhook.ts             checkout.session.completed → send confirmation email with .ics
    attendees.ts, report.ts       Admin dashboard data
    lib/stripe.ts, lib/email.ts   Shared helpers
content/                         Brand guide PDFs, logos (not served; reference material)
public/images/                    Served static images
```

## Content authoring

**Copy lives in `src/data/workshop.json`.** Hero text, agenda items, instructor bio/traits, FAQs, location, pricing, SEO meta — all here. Prefer editing JSON over hardcoding strings in components. When I add a new content field to a component, add it to `workshop.json` unless it's structural.

## Brand tokens

Tailwind theme is in `src/styles/global.css`. Current tokens:

- `eos-orange` `#FF7900` (primary — matches brand `#FF7900`)
- `eos-orange-light` `#FF9933` (lighter accent, not in brand guide — derived)
- `eos-dark` `#152233` (navy — **brand spec is `#142233`, we're off by one**)
- `eos-dark-light` `#1E3044` (derived)
- `eos-gray` `#4A5568`, `eos-light` `#F7FAFC`, `eos-gold` `#D4A843` (**gold is not in the brand guide**)

Font: site uses Roboto 400/500/700/900. **Brand spec is Montserrat primary + Roboto Condensed secondary.** Don't "fix" this without asking — it's a load-bearing change.

For any UI work, invoke the `eos-brand` skill for the full brand rules.

## Conventions I've learned

- **Astro components** for everything static. Reach for React only when client-side state is genuinely needed (currently: Stripe checkout form).
- **Inline `<script is:inline>`** for small DOM handlers in Astro pages (see `Pricing.astro`, `Layout.astro` scroll tracking). Don't reach for a framework for this.
- **No TypeScript in Astro frontmatter** beyond interface Props — keep it simple.
- **Functions return JSON with `Content-Type: application/json`.** Errors use standard HTTP codes; 409 for sold-out is a real contract the frontend depends on.
- **PostHog events** (`checkout_started`, `scroll_depth`) are fire-and-forget — never block UX on analytics.
- **Env vars**: `PUBLIC_*` prefix for anything referenced in client code; everything else server-only. See `.env.example`.
- **Commits**: conventional (`feat:`, `fix:`, `docs:`, `chore:`). Feature branches off `main`, PRs via `gh pr create`.

## Running locally

- Pure UI work: `npm run dev` → http://localhost:4321 (no functions, no Stripe)
- Full stack: `netlify dev` → http://localhost:8888 (needs `netlify link` + env vars on the linked site, plus `stripe listen --forward-to localhost:8888/api/stripe-webhook` for webhooks)

## Deployment

Pushes to `main` auto-deploy on Netlify. Sandbox: https://great-boss-workshop.netlify.app. Production domain goes live per the go-live checklist in memory.

## Things to not do

- Don't add a database "just in case." If a feature needs one, discuss first — current plan is to stay on Stripe + (optionally) Netlify Blobs until a real query forces Postgres.
- Don't add gold (`#D4A843`) or other off-brand colors to new work. If you need a new color, pull from the brand secondary palette (navy-gray `#445777`, light blue-gray `#E5E8EB`, peach `#FBEDE2`, dark slate `#3B4343`).
- Don't add comments that restate the code. Brief "why" comments only.
- Don't add `console.log` or debug output to committed code.
- Don't commit `.env`, `deno.lock`, `skills-lock.json` (already gitignored).

## When making UI changes

1. Check the brand skill first (`eos-brand`) — colors, type hierarchy, logo rules, tone.
2. Edit content in `workshop.json` when possible, not in the component.
3. Test responsive at mobile (<640px), tablet (`sm`), desktop (`md`+).
4. If I touch the Hero, Pricing, or checkout flow, re-read README test cases §1–6.
