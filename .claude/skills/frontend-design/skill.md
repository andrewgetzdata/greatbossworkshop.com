---
name: frontend-design
description: Frontend design review and implementation for this Astro + Tailwind site. Invoke before building any new component or restructuring UI. Enforces responsive behavior, type rhythm, spacing consistency, accessibility, and the project's component conventions. Pair with eos-brand for color/typography/voice.
---

You are doing frontend design work on an Astro 5 + Tailwind 4 + React 19 site. This skill governs *structure, layout, and interaction* — pair it with `eos-brand` for visual identity rules.

## First, read these

- The parent `CLAUDE.md` — project conventions, stack, what-not-to-do
- `eos-brand` skill — color tokens, typography, logo, tone
- `src/styles/global.css` — Tailwind theme tokens
- `src/layouts/Layout.astro` — SEO, analytics, font loading, scroll tracking

## Component conventions

- **Default to `.astro`.** One file per feature section (Hero, Pricing, FAQ, etc.) in `src/components/`.
- **React only when client state is genuinely required** (e.g., `StripeCheckout.tsx`). Don't reach for React for hover states or show/hide — Tailwind + a tiny inline script is almost always enough.
- **Inline `<script is:inline>`** at the bottom of the Astro component for small DOM handlers. Keep scripts in the component that owns the UI, not in a global bundle.
- **No CSS files.** All styling via Tailwind utility classes. The only global CSS is `src/styles/global.css` (theme tokens + `@import "tailwindcss"`).
- **Props typed via `interface Props`** in frontmatter when a component takes inputs. Keep it small.

## Content vs. structure

Copy belongs in `src/data/workshop.json`. Structural HTML belongs in the component.

Exceptions (stay in the component):
- Component-specific CSS classes and layout decisions
- Microcopy that's inseparable from structure (button labels tied to a specific interaction)

If adding a new content field, add it to `workshop.json` *and* update any derived JSON-LD in `Layout.astro` if relevant.

## Responsive rules

Mobile-first. The site is commonly viewed on phones.

Breakpoints in use:
- default (mobile, <640px)
- `sm:` 640px+ (tablet)
- `md:` 768px+ (desktop)

Patterns I've seen work in this codebase:
- Grids: `grid-cols-1 sm:grid-cols-2` or `sm:grid-cols-3` for cards
- Text scaling: `text-3xl md:text-4xl` for H2, `text-4xl md:text-6xl` for H1
- Container: `mx-auto max-w-{3xl|4xl|5xl} px-4`
- Stacking at mobile: `flex flex-col md:flex-row`
- Centering: `text-center md:text-left` to let mobile stack centered, desktop align left

**Always test at <640px.** Text shouldn't overflow, CTAs should be full-width on mobile, no horizontal scroll.

## Spacing system

Follow the existing rhythm. Don't introduce new magic numbers unless necessary.

- Section vertical padding: `py-16 md:py-24`
- Section → heading gap: `mt-3` (subheading), `mt-12` (content below heading)
- Inline element gap: `gap-3` (tight), `gap-6` (comfortable), `gap-8` (loose)
- Button padding: `px-8 py-4` for primary CTAs, `px-4 py-3` for selection cards

Rounded corners:
- Cards: `rounded-xl` or `rounded-2xl`
- Buttons: `rounded-lg`
- Pills / badges: `rounded-full`

Shadows:
- `shadow-sm` for subtle surfaces, `shadow-lg` for elevated CTAs, `shadow-xl` for prominent cards

## Interactive elements

**Buttons:**
- Primary CTA: `bg-eos-orange hover:bg-eos-orange-light` with orange focus ring
- Secondary: bordered, transparent fill, hover brightens
- Always include `focus:outline-none focus:ring-2 focus:ring-eos-orange focus:ring-offset-2` for keyboard users
- Disabled state: `disabled:cursor-not-allowed disabled:opacity-50` — never just hide disabled CTAs

**Cards selected by click** (like the session picker in `Pricing.astro`): store selection in a module-level var, toggle border color and bg in a render function, re-render on data refresh without clobbering selection.

**Transitions:** `transition` on hover/focus. Keep durations default — don't stage elaborate animations; that conflicts with the "less is more" brand voice.

## Accessibility baseline

- Every `<img>` has meaningful `alt` text (empty `alt=""` only for decorative)
- Every interactive element is a real `<button>` or `<a>` (not a clickable `<div>`)
- Focus rings visible; never `outline: none` without a visible replacement
- Skip-to-content link already exists in `Layout.astro` — don't remove it
- Color contrast: pair orange (`#FF7900`) with white or navy, not with light grays. Body text on white should be `text-gray-700` minimum.
- Form inputs: paired `<label>`, sensible `autocomplete` attributes, clear error states

## Data loading patterns

The `Pricing.astro` component demonstrates the site's preferred pattern:
1. Show a loading placeholder
2. Fetch from `/api/*` (cached, fast)
3. Render
4. Background-refetch with `?fresh=1` to update volatile fields (spot counts) without re-rendering the whole grid

Don't block render on a slow fetch. Don't spinner-lock the UI.

## SEO & analytics

- Page-level metadata flows through `Layout.astro` via `title` / `description` props
- JSON-LD structured data for the event is in `Layout.astro` — update if event details change
- PostHog events are fire-and-forget via `window.posthog?.capture(...)`. Don't await them.
- Scroll depth (25/50/75/100%) is auto-tracked in `Layout.astro` — don't duplicate.

## When adding a new section/component

1. Decide: is this content (→ new field in `workshop.json`) or a new UI pattern (→ new `.astro` component)?
2. Mobile-first: sketch the mobile stack, then the desktop layout.
3. Run the `eos-brand` checklist against colors, type, and tone.
4. Check responsive behavior in the browser at <640px, 768px, 1200px.
5. Verify keyboard nav works — tab through interactive elements.
6. If the component fetches data, add the loading → render → background-refresh pattern.
7. Update JSON-LD in `Layout.astro` if the change affects schema.org event fields.

## What to avoid

- Long `<style>` blocks in components — Tailwind should cover 99%
- Hardcoded colors in hex (`bg-[#FF7900]`) — use `bg-eos-orange`
- New font imports — stay on the fonts in `Layout.astro` unless the user has agreed to a font migration
- Large JS bundles — React only for actually-dynamic components
- CSS-in-JS, emotion, styled-components — not in this stack
- Clever animation libraries — the brand is restrained

## Deliverable format

When completing frontend work:
- Note which files changed and why
- Call out any responsive edge cases you verified (or couldn't verify without running the site)
- Flag any brand or accessibility divergence introduced or discovered
- Suggest the single next smallest improvement, not a refactor wishlist
