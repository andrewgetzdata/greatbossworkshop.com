# Go-Live Guide

Everything required to take the site live on **roygetz.com** with real payments,
emails, and the automated reports. Work top to bottom — some steps depend on
earlier ones (Resend domain → email; Stripe live keys → webhook).

Netlify site: `great-boss-workshop` (siteId `ef05547f-a4ef-428a-ac90-00d2941192db`),
sandbox URL https://great-boss-workshop.netlify.app.

---

## 1. Domain — point GoDaddy `roygetz.com` at Netlify

1. **Netlify → Site → Domain management → Add a domain** → `roygetz.com` (and `www.roygetz.com`).
2. Netlify shows the DNS target. Two options:
   - **Recommended — Netlify DNS:** in Netlify, choose "Set up Netlify DNS for roygetz.com". It gives you 4 nameservers. In **GoDaddy → roygetz.com → Nameservers → Change → Enter my own**, paste those 4. (Simplest; Netlify manages all records incl. the Resend ones below.)
   - **Or keep GoDaddy DNS:** add an `A` record for `@` → Netlify's load-balancer IP `75.2.60.5`, and a `CNAME` for `www` → `<your-site>.netlify.app`.
3. In Netlify, set **`roygetz.com` as the primary domain**; enable **"Force HTTPS"** (Netlify auto-provisions a Let's Encrypt cert — can take up to an hour after DNS propagates).
4. Verify: `https://roygetz.com` loads the site and shows a valid cert.

> DNS propagation can take 1–48h (usually <1h). Check with `dig roygetz.com +short`.

---

## 2. Resend — verify the sending domain (blocks all email)

Nothing emails real recipients until this is done. Today the sender is Resend's
sandbox `onboarding@resend.dev`, which **only delivers to the account owner**.

1. Log in to **[resend.com](https://resend.com)** with **"Continue with Google"** (the account is under `agetz.51@gmail.com` — it's a Google-login account, not password).
2. **Domains → Add Domain** → `roygetz.com`.
3. Resend shows DNS records (SPF `TXT`, DKIM `CNAME`/`TXT`, and a return-path). Add them in whichever DNS you chose in Step 1 (Netlify DNS or GoDaddy). Wait for Resend to show **Verified** (minutes to a few hours).
4. Decide the sender addresses (used in env vars below):
   - `EMAIL_FROM` = `Roy Getz <workshop@roygetz.com>` (or `roy@roygetz.com`)
   - `EMAIL_REPLY_TO` = `roy.getz@eosworldwide.com` (confirm with Roy)
5. **Create a production Resend API key** (Resend → API Keys) → this becomes `RESEND_API_KEY`.

---

## 3. Stripe — go live

The app is Stripe-driven (products = workshops, prices carry `payment_type`
metadata, capacity from `max_seats`). Redo the test-mode setup in **live mode**.

1. **Toggle Stripe Dashboard to "Live mode"** (top-right).
2. **Activate the account** if not already (business details, bank account for payouts). This is what routes ACH + card money to Roy's bank.
3. **Create live products + prices** for the real workshop dates. Follow `STRIPE_SETUP.md` exactly, but in live mode:
   - Product metadata: `workshop_type=great_boss`, `session_date` (YYYY-MM-DD), `session_display`, `max_seats`, `location`, `venue`, `address`, `maps_url` (or `webinar_url` for online), `time`.
   - Two prices per product, each with metadata `payment_type` = `ach` or `card` (ACH = base, card = +3%).
4. **Get live API keys** (Developers → API keys): `sk_live_…` → `STRIPE_SECRET_KEY`, `pk_live_…` → `PUBLIC_STRIPE_PUBLISHABLE_KEY`.
5. **Create the live webhook** (Developers → Webhooks → Add endpoint):
   - URL: `https://roygetz.com/api/stripe-webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`
   - Copy the signing secret `whsec_…` → `STRIPE_WEBHOOK_SECRET`.
6. **Enable ACH** if not already (Stripe → Settings → Payment methods → US bank account / ACH Direct Debit). The checkout uses `us_bank_account` via Financial Connections.

---

## 4. Netlify — production environment variables

**Netlify → Site → Site configuration → Environment variables.** Set these
(scope: all / production). Names come from `.env.example`:

| Variable | Value |
|---|---|
| `PUBLIC_SITE_URL` | `https://roygetz.com` |
| `STRIPE_SECRET_KEY` | `sk_live_…` |
| `PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` (live) |
| `RESEND_API_KEY` | production `re_…` |
| `EMAIL_FROM` | `Roy Getz <workshop@roygetz.com>` |
| `EMAIL_REPLY_TO` | `roy.getz@eosworldwide.com` |
| `ADMIN_API_KEY` | a fresh long random string (see §6) |
| `PUBLIC_POSTHOG_KEY` / `PUBLIC_POSTHOG_HOST` | if using PostHog (optional) |

After setting, **trigger a redeploy** (Netlify → Deploys → Trigger deploy) so the
new vars are baked into the build.

---

## 5. GitHub Actions — secrets for the automated reports

Two scheduled workflows email reports: **`export-archived-events.yml`** (daily,
past-event attendee CSVs) and **`weekly-reporting.yml`** (Mon 6am ET, PDF report).
They run on GitHub's runners, so they need their **own** secrets (separate from Netlify).

**GitHub → repo → Settings → Secrets and variables → Actions → New repository secret:**

| Secret | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` (same as Netlify) |
| `RESEND_API_KEY` | production `re_…` |
| `EMAIL_FROM` | `Roy Getz <workshop@roygetz.com>` |
| `EMAIL_REPLY_TO` | `roy.getz@eosworldwide.com` |
| `EXPORT_RECIPIENTS` | `agetz.51@gmail.com` (comma-add Roy/others later) |

Then **test each workflow manually** before trusting the schedule:
Actions → select the workflow → **Run workflow** (`workflow_dispatch`). Confirm the
email arrives. Only after a clean manual run should you rely on the cron.

> Note: `weekly-reporting.yml` cron is `0 11 * * 1` = 6am EST / 7am EDT (GitHub cron has no DST). Fine as-is; ask if you want exact 6am ET year-round.

---

## 6. Security — rotate everything shared during development

Test keys and the admin key were visible in development. Before launch:

- [ ] **New `ADMIN_API_KEY`** — generate a fresh random string (e.g. `openssl rand -hex 32`), set it in Netlify. The admin panel login (`/admin`) uses this.
- [ ] **Live Stripe keys are new** by definition (test keys never worked in prod) — just ensure test keys aren't left anywhere.
- [ ] **New production Resend key** (don't reuse the dev one).
- [ ] **Rotate Roy's GoDaddy password** — it was sent in plaintext by email earlier. Tell Roy to change it and stop emailing credentials.
- [ ] Confirm `.env` (local, gitignored) is never committed.

---

## 7. Pre-launch verification (do a real $ test, then refund)

- [ ] Visit `https://roygetz.com/greatbossworkshop`, pick a date, fill the registration modal, and complete a **real** card checkout (small live charge).
- [ ] Confirm redirect to `/success` (not a dead port — the origin-derivation fix handles this, and `PUBLIC_SITE_URL` is set).
- [ ] Confirm the **confirmation email** arrives (from `workshop@roygetz.com`) with the `.ics` attachment.
- [ ] Confirm the Stripe webhook shows a `200` (Stripe → Webhooks → your endpoint → recent deliveries).
- [ ] Log into `/admin` with the new `ADMIN_API_KEY`; confirm the purchase shows and CSV export works.
- [ ] **Refund** the test charge in Stripe; confirm the seat frees up on the site (may lag by the cache TTL).
- [ ] Test an **ACH** checkout too (Financial Connections flow differs from card).

---

## 8. Content + polish before announcing

- [ ] **Real testimonials** — `src/data/workshop.json` still has placeholder testimonials. Replace with real quotes (Cassie was gathering these).
- [ ] **OG image** — `meta.ogImage` references `/images/og-image.jpg` which isn't in `public/images/`. Add one, or social shares have no preview.
- [ ] **Certificate copy** — Roy wanted "facilitator" → "Expert EOS Implementer" on the completion certificate (if that asset is used).
- [ ] Proof the live workshop dates/prices/locations in Stripe match reality.
- [ ] Confirm `EMAIL_FROM` display name and reply-to read correctly to a real recipient.

---

## 9. Introduce TMS

Once the above is green, loop in **The Marketing Seat** (Roy's marketing firm) as
he requested — the site, checkout, and reporting are the pieces they'll drive traffic to.

---

### Quick reference — what lives where

- **Site + `/api/*` functions:** Netlify (auto-deploys on push to `main`).
- **Source of truth for sessions/pricing/capacity/purchases:** Stripe (no database).
- **Emails:** Resend (confirmation + reports).
- **Scheduled reports:** GitHub Actions (daily CSV export, weekly PDF).
- **Env vars:** Netlify (runtime) + GitHub Secrets (workflows) — set in both.
