---
name: eos-brand
description: Enforce EOS Great Boss Workshop brand guidelines (colors, typography, logo usage, voice). Use before any UI change — hero copy, colors, layouts, new components, imagery, or marketing copy. Reference is the official EOS Great Boss Style Guide v2.0 (2023) plus the public EOS brand hub at https://branding.eosworldwide.com/.
---

You are enforcing the Great Boss Workshop brand. Before approving or writing any visual / copy change, run it through these rules. When in doubt, favor restraint — the brand guide's own guidance is **"less is more."**

## Sources of truth

- Local PDF: `content/EOS Great Boss Style Guide.pdf` (primary, most specific to Great Boss)
- Public EOS brand hub: https://branding.eosworldwide.com/ (broader EOS system; use when Great Boss guide doesn't cover something)
- Logo assets in `content/`: `GB-Horizontal-white-orange.png`, `GB-Stacked-*.png`, `GB-EventBrite Header logo.jpg`, `LMA.png`

## Brand vision & voice

- Real, raw, engaging. Mixes photography with simple illustrations, textures, overlays.
- Keep it intuitive and simple. **Less is more.**
- Tone: engaging, friendly, informative, bold, professional.
- The exclamation point is the signature visual element — it signals *humble confidence* and marks crucial insights or call-outs. Use sparingly and deliberately, never as decoration.

## Audience (personas)

Four personas the brand speaks to. Copy should land with all four:
1. **Leadership team member** at a stalled / disconnected company
2. **Mid-level manager** at an entrepreneurial company (may or may not run EOS)
3. **Visionary** of a company running EOS
4. **Integrator** of a company running EOS

Avoid consultant-speak. Talk like a direct peer.

## Color palette

**Primary (use these first):**
- Navy `#142233` — default dark backgrounds, dark text
- Orange `#FF7900` — accents, CTAs, attention

**Secondary (when primary isn't enough):**
- Navy-gray `#445777`
- Light blue-gray `#E5E8EB`
- Peach `#FBEDE2`
- Dark slate `#3B4343`

**Tints:** Decrease in 20% steps. Anything below 60% tint requires dark text.

**Do not invent colors.** If a design needs another color, pull from the secondary palette, not the void.

### Current site divergence (known)
The repo's Tailwind theme uses `#152233` instead of brand-spec `#142233`, plus a `#D4A843` gold that is **not** in the brand guide. Don't propagate gold into new work. If the user asks to fix the navy to `#142233`, do it; otherwise leave as-is and flag the divergence in review.

## Typography

**Primary: Montserrat** (Extra Bold, Bold, Semi Bold, Medium, Regular, Light) — for headlines, subheads, body.
**Secondary: Roboto Condensed** (Bold, Regular, Light) — when Montserrat is too wide.
**Decorative: Arsilon Regular / Smooth** — only when talking about EOS Implementers, sparingly.

### Current site divergence (known)
Layout.astro loads only Roboto 400/500/700/900. **This is not brand-compliant.** Flag it in any substantial UI work. Don't silently swap fonts — font changes affect every component's rhythm.

### Type hierarchy (web spec from guide)
- H1 — 64px Extra Bold
- H2 — 40px Extra Bold
- H3 — 25px Bold
- H4 — 18px Bold
- H5 — 15px Bold, 8px letter-spacing

Headlines preferably **all caps**, with the **orange accent bar** to the left (see brand PDF examples — this is a distinctive brand element).

## Logo usage

**Variants:**
- **Wordmark Logo** — full "GREAT BOSS WORKSHOP" with stacked exclamation mark icon
- **Logomark** — horizontal compact lockup
- **Model Icon** — exclamation point alone (only when Great Boss brand is already established on the page/surface)

**Spacing:** use the Exclamation Point as the padding unit between the logo and other elements.

**Color pairing:**
- Navy + orange logo on **light** backgrounds (preferably white)
- White + orange logo on **dark** backgrounds (preferably navy)
- Avoid single-color if possible. **Never** place orange logo on navy or vice versa (they blend).

**Minimum print size:** 0.70 inches wide. On web, keep the wordmark legible — drop to Model Icon in tight spaces (tab favicon, app icon).

### Incorrect usage (flag these if you see them)
- Off-palette colors
- Typeface swaps on the logo
- Rescaled, warped, drop-shadowed, or outlined logo
- Logo on complex/patterned backgrounds
- Navy logo on dark backgrounds, white logo on light backgrounds

## Visual elements

**Exclamation Point uses:**
- As a list bullet for *crucial* insights (not ordinary lists)
- Call-outs to draw attention to one idea or phrase
- App / favicon contexts where the wordmark won't fit

**Icon set (orange line icons):**
Social: Facebook, Twitter, YouTube, LinkedIn, Instagram.
Concepts: "With People You Love", Integrator, Visionary, Owner, Management, Accountability.
If the design needs an icon from the brand-defined set, use it. For generic icons (checkmark, arrow), use inline SVG consistent with Tailwind conventions.

**Patterns:** Subtle repeating Exclamation-Point pattern on solid backgrounds (orange, navy, navy-gray). Good for hero/section backdrops. Keep opacity low so text and logos sit cleanly on top.

**Photography:** Real, unstaged, people-focused. Avoid stock-looking imagery.

## Copy rules

- Prefer short, direct sentences.
- All-caps reserved for headlines and eyebrow labels — not for emphasis mid-sentence.
- Use em-dashes and the orange accent bar for emphasis, not bold runs.
- Avoid exclamation points in body copy — the brand reserves them for the logo mark.
- Trademark the brand name as **Great Boss™** on first prominent use.

## Review checklist

Before approving UI changes, run through:

- [ ] Colors are navy `#142233` / orange `#FF7900` or secondary palette — no gold, no new hues
- [ ] Logo (if present) uses correct color pairing and adequate spacing
- [ ] Typography: Montserrat (primary) or Roboto Condensed (secondary) — **flag current Roboto-only divergence**
- [ ] Headlines use all-caps + orange accent bar where it's a feature-level headline
- [ ] Body copy is direct, no mid-sentence exclamation points
- [ ] Exclamation Point motif used only for crucial insights / call-outs, not as decoration
- [ ] Imagery feels real/raw — not generic stock
- [ ] Responsive: still brand-compliant at mobile (<640px) and desktop

## How to apply this skill

When the user requests UI, copy, or design changes:
1. Read the relevant sections above before writing code.
2. Do the change.
3. Call out any brand divergence you noticed — current or introduced — so the user can decide whether to fix it now or defer.
4. If asked to fix a divergence, do so surgically. A color-token change affects every component; verify nothing else breaks.
