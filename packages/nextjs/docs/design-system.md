# AEGIS — Design System

Visual and implementation specification for the interface. Everything here is
normative: if a screen needs to deviate from something defined in this
document, the exception becomes a new line here before it becomes code.

Complements [`screen-specification.md`](screen-specification.md), which
describes _which_ screens exist. This document describes _how_ they look.

---

## 1. Principles

The interface needs to convey **security, calm, and trust**. The user is
delegating financial power to an autonomous agent — the UI is what makes that
feel like a calm decision instead of a risk. It's not "crypto hype" aesthetics
nor "cold corporate": it's clean, light, spaced out, and soft.

Five rules that resolve most day-to-day design questions:

1. **Whitespace is the primary design element.** When in doubt between adding
   an element or increasing breathing room, increase breathing room.
2. **Calm over emphasis.** Nothing blinks, pulses, saturates, or shouts.
   Alerts communicate through color and position, never through aggression.
3. **Blue is used sparingly.** `#62AFFC` is action and trust — CTA, link,
   active icon, hover, focus. Never a large block of background.
4. **Technical data is technical data.** Hash, address, amount, and ID always
   in monospace. This visually separates "what the machine produced" from
   "what the interface is saying" — and is part of feeling auditable.
5. **Low density by default.** Prefer less information per screen, with
   detail accessible one click away, over stacking everything at once.

### 1.1 What we take from each reference

| Reference     | What we adopt                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0G.ai**     | Serious protocol structure: clear hierarchy between sections, well-delimited technical blocks, short explanatory text next to each concept.                                                       |
| **The Graph** | Data presentation: cards with large numbers, simple icon, short label; regular, well-distributed grid; a sense of robust infrastructure. The direct model for metrics sections (dashboard KPIs).  |
| **Comp.vc**   | Light background, soft 3D shapes as decoration, large and friendly typography, generous spacing between sections, light shadow on cards. The model for the overall tone and for the landing page. |

What we **don't** adopt from any of them: dark background gradients, neon
glow, particle animations, and any full-width block of saturated color.

---

## 2. Identity

### 2.1 Logo

File: [`public/logo.svg`](../public/logo.svg) — layered shield, 506×416, built
with three strokes (`stroke-width: 32`, rounded corners).

Layers and colors, top to bottom:

| Layer                           | Color     | Role                                 |
| ------------------------------- | --------- | ------------------------------------ |
| Top diamond (shield silhouette) | `#62AFFC` | outline that identifies the brand    |
| Middle band                     | `#0F2A47` | separation; anchors the mark to text |
| Bottom chevron                  | `#62AFFC` | closes the shape                     |

The mark works directly on `#F9FBFA` — there's no more dependency on a dark
container. With blue carrying the outer silhouette and navy in the core, the
recognizable shield outline is what shows up first, and the navy ties the mark
to the `#0F2A47` typography next to it. This also aligns with the rule in
§3.2: blue is fill and shape, not text.

Usage rules:

- Minimum height **28px**. The 32-unit stroke on a 416 viewBox renders at
  ~2.2px at that height; below that, the blue starts to fade against the
  light background and the layers visually close up.
- **Below 24px** (favicon, avatar, tab icon), use a monochrome version in
  `#0F2A47` — blue can't sustain a 1px stroke on `#F9FBFA`. File to create:
  `logo-mono.svg`.
- **On dark or navy backgrounds** (footer, OG image, splash), swap the core's
  `#0F2A47` for `#F9FBFA` and keep the blue. File to create when the need
  arises: `logo-inverse.svg`. Not a blocker for any screen in the current
  scope.
- Clear space: half the logo's height on every side.
- Never rotate, distort, or apply shadow, gradient, or outline.
- Never recolor the layers outside the variants above.
- Wordmark: "AEGIS" in Manrope ExtraBold, `-0.02em` tracking, uppercase, in
  `#0F2A47`.

### 2.2 Brand colors

| Token        | Hex       | Use                                               |
| ------------ | --------- | ------------------------------------------------- |
| `background` | `#F9FBFA` | Application background. The only page background. |
| `surface`    | `#E3EBF2` | Cards, panels, elevated surfaces.                 |
| `foreground` | `#0F2A47` | Primary text, icons, logo stroke.                 |
| `brand`      | `#62AFFC` | Accent: CTA, hover, focus, active icon, charts.   |

---

## 3. Full palette

The four colors above are the base, but aren't enough: the interface needs to
communicate `Allowed` / `Denied` / `Fallback` / `Pending` (see §0.1 of
`screen-specification.md`) and needs secondary text. The tokens below are derived
from that base, kept desaturated so as not to break the sense of calm.

### 3.1 Neutrals

| Token                    | Hex       | Use                                               | Contrast on `#F9FBFA`              |
| ------------------------ | --------- | ------------------------------------------------- | ---------------------------------- |
| `--color-background`     | `#F9FBFA` | page background                                   | —                                  |
| `--color-surface`        | `#E3EBF2` | cards, panels                                     | —                                  |
| `--color-surface-raised` | `#FFFFFF` | inputs, dropdowns, table rows on top of `surface` | —                                  |
| `--color-border`         | `#D3DFE9` | 1px borders, dividers                             | —                                  |
| `--color-border-strong`  | `#B9CBDB` | input border on hover, table                      | —                                  |
| `--color-foreground`     | `#0F2A47` | primary text                                      | **14.0:1** ✓ AAA                   |
| `--color-muted`          | `#4A6A88` | secondary text, labels                            | **5.4:1** ✓ AA                     |
| `--color-subtle`         | `#7A93AC` | placeholder, disabled text, timestamps            | **3.1:1** — only ≥18px or disabled |

### 3.2 Brand and action

| Token                  | Hex       | Use                                                                                            |
| ---------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| `--color-brand`        | `#62AFFC` | primary button fill, active icon, chart's main series, visual focus border                     |
| `--color-brand-strong` | `#1B6ACB` | **text** in blue: links, tertiary button, focus ring. Mandatory wherever blue needs to be read |
| `--color-brand-soft`   | `#E6F0FD` | selected-state background, list item hover, informational badge tint                           |

> **Non-negotiable contrast rule.** `#62AFFC` on `#F9FBFA` gives **2.2:1** —
> fails even the 3:1 criterion for non-text elements. And white text on
> `#62AFFC` gives **2.3:1**, also a fail.
>
> Practical consequences:
>
> - Blue link or text → use `--color-brand-strong` (`#1B6ACB`, **5.1:1** ✓).
> - Primary button filled with `#62AFFC` → the label is `#0F2A47`
>   (**6.3:1** ✓), **never** white.
> - Informational icon alone in `#62AFFC` → only if paired with a text label.

### 3.3 Semantic (status)

Each status has a pair: `*-fg` for text/icon and `*-soft` for the badge
background.

| Status                                 | `-fg`     | `-soft`   | `-fg` contrast on `#F9FBFA` |
| -------------------------------------- | --------- | --------- | --------------------------- |
| `success` — Allowed, Protected         | `#1E7A50` | `#E4F3EC` | **5.1:1** ✓                 |
| `danger` — Denied, Compromised         | `#B03A32` | `#FAE9E7` | **5.8:1** ✓                 |
| `warning` — Fallback, Paused, expiring | `#9A6510` | `#FBF0DC` | **4.8:1** ✓                 |
| `info` — Pending, Indexing             | `#1B6ACB` | `#E6F0FD` | **5.1:1** ✓                 |
| `neutral` — Unprotected, Draft         | `#4A6A88` | `#E3EBF2` | **5.4:1** ✓                 |

Green and red are intentionally pulled toward dark and desaturated — a
"crypto success" `#00FF88` would destroy the sense of calm.

**Color is never the only signal.** Every status badge carries an icon +
text, for color blindness and for black-and-white reading.

### 3.4 Data viz

Sequence for charts, in order: `#62AFFC` · `#1E7A50` · `#9A6510` · `#7A93AC` ·
`#1B6ACB` · `#B03A32`. In approved-vs-denied charts, always `success` and
`danger`, never the generic sequence.

---

## 4. Typography

Two families, both Google Fonts.

- **Manrope** — headings and body. Geometric, sans-serif, friendly without
  losing seriousness. Weights used: 400, 500, 600, 800.
- **JetBrains Mono** — technical data: hashes, addresses, amounts, IDs,
  nonces, timestamps, tags, code, JSON keys. Weights: 400, 500.

### 4.1 Loading (Next.js)

```ts
// app/layout.tsx
import { JetBrains_Mono, Manrope } from "next/font/google";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "800"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});
```

Apply `${manrope.variable} ${jetbrainsMono.variable}` on `<html>`. Remove the
scaffold's Geist fonts and the `font-family: Arial` from `globals.css`.

### 4.2 Scale

| Role       | Size / line height | Weight | Tracking          | Where                          |
| ---------- | ------------------ | ------ | ----------------- | ------------------------------ |
| `display`  | 60 / 64px          | 800    | −0.03em           | landing hero                   |
| `h1`       | 40 / 48px          | 800    | −0.02em           | page title                     |
| `h2`       | 30 / 38px          | 600    | −0.02em           | section                        |
| `h3`       | 22 / 30px          | 600    | −0.01em           | card title                     |
| `h4`       | 18 / 26px          | 600    | 0                 | subtitle, block header         |
| `body-lg`  | 18 / 30px          | 400    | 0                 | intro text, descriptions       |
| `body`     | 16 / 26px          | 400    | 0                 | default                        |
| `body-sm`  | 14 / 22px          | 400    | 0                 | supporting text, table cells   |
| `label`    | 13 / 18px          | 500    | 0.01em            | form label, column header      |
| `caption`  | 12 / 16px          | 400    | 0                 | timestamp, footnote            |
| `overline` | 12 / 16px          | 600    | 0.08em, uppercase | section label, KPI label       |
| `metric`   | 40 / 44px          | 800    | −0.02em           | KPI card's large number        |
| `mono`     | 14 / 22px          | 400    | 0                 | hash, address, ID              |
| `mono-sm`  | 12 / 18px          | 400    | 0                 | hash in table, technical badge |

Rules:

- Maximum width for running text: **68 characters** (`max-w-[65ch]`).
- Never justify. Never uppercase in blocks larger than a label.
- Numbers in tables and KPIs: `font-variant-numeric: tabular-nums`.
- Truncated hash/address always in `0x1B6a…4Cd2` format (6 + 4), with a copy
  button next to it and the full value in the tooltip.

---

## 5. Spacing, grid, and layout

**4px base.** Scale: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80 · 96 · 128.

| Context                          | Value                         |
| -------------------------------- | ----------------------------- |
| Card inner padding               | 24px (32px on featured cards) |
| Gap between cards in a grid      | 20px                          |
| Gap between blocks inside a card | 16px                          |
| Space between page sections      | 48px                          |
| Space between landing sections   | 96–128px                      |
| Content area vertical padding    | 40px                          |
| Container horizontal padding     | 24px (mobile 16px)            |

**Container:** max width `1280px`, centered. Landing can use `1200px` for
content with decorative bands bleeding off the edge.

**App shell:** fixed `260px` sidebar (`72px` collapsed), `64px` topbar, content
in the remaining space.

**Breakpoints** (Tailwind defaults): `sm 640` · `md 768` · `lg 1024` ·
`xl 1280` · `2xl 1536`. Below `lg` the sidebar becomes a drawer.

**Metrics grid** (The Graph style): 4 columns at `xl`, 2 at `md`, 1 on mobile.
Each KPI card is: `overline` (label) → `metric` (number) → change with an
arrow and semantic color. A simple icon in the top-right corner, 20px, in
`--color-subtle`.

---

## 6. Shape: radius, shadow, and border

### 6.1 Radius

| Token           | Value  | Use                                   |
| --------------- | ------ | ------------------------------------- |
| `--radius-sm`   | 8px    | badge, tag, checkbox                  |
| `--radius-md`   | 12px   | button, input, select                 |
| `--radius-lg`   | 16px   | card, panel, dropdown                 |
| `--radius-xl`   | 24px   | featured card, modal, landing section |
| `--radius-full` | 9999px | pill, avatar, status badge            |

### 6.2 Shadow

Always in translucent navy — never pure black, which muddies the light
background.

```css
--shadow-sm: 0 1px 2px 0 rgba(15, 42, 71, 0.04);
--shadow-md: 0 2px 8px -2px rgba(15, 42, 71, 0.06), 0 1px 3px -1px rgba(15, 42, 71, 0.04);
--shadow-lg: 0 8px 24px -8px rgba(15, 42, 71, 0.1), 0 2px 6px -2px rgba(15, 42, 71, 0.05);
--shadow-xl: 0 20px 48px -16px rgba(15, 42, 71, 0.12);
```

`sm` for table rows and badges; `md` is the card default; `lg` for clickable
card hover and dropdowns; `xl` only for modals. **Nothing stronger than this
exists.** No inner shadow, no colored shadow, no glow.

### 6.3 Border

`1px solid var(--color-border)`. Cards on `background` can use shadow _or_
border — use both only when the card is clickable and needs extra definition.
Internal dividers: `1px` in `--color-border`, never thicker.

---

## 7. Tokens (Tailwind v4)

Replace the contents of `app/globals.css` with:

```css
@import "tailwindcss";

@theme {
  /* Neutrals */
  --color-background: #f9fbfa;
  --color-surface: #e3ebf2;
  --color-surface-raised: #ffffff;
  --color-border: #d3dfe9;
  --color-border-strong: #b9cbdb;
  --color-foreground: #0f2a47;
  --color-muted: #4a6a88;
  --color-subtle: #7a93ac;

  /* Brand */
  --color-brand: #62affc;
  --color-brand-strong: #1b6acb;
  --color-brand-soft: #e6f0fd;

  /* Status */
  --color-success: #1e7a50;
  --color-success-soft: #e4f3ec;
  --color-danger: #b03a32;
  --color-danger-soft: #fae9e7;
  --color-warning: #9a6510;
  --color-warning-soft: #fbf0dc;
  --color-info: #1b6acb;
  --color-info-soft: #e6f0fd;

  /* Typography */
  --font-sans: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-mono), ui-monospace, SFMono-Regular, monospace;

  /* Radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;

  /* Shadow */
  --shadow-sm: 0 1px 2px 0 rgba(15, 42, 71, 0.04);
  --shadow-md: 0 2px 8px -2px rgba(15, 42, 71, 0.06), 0 1px 3px -1px rgba(15, 42, 71, 0.04);
  --shadow-lg: 0 8px 24px -8px rgba(15, 42, 71, 0.1), 0 2px 6px -2px rgba(15, 42, 71, 0.05);
  --shadow-xl: 0 20px 48px -16px rgba(15, 42, 71, 0.12);
}

@layer base {
  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
  }
  :focus-visible {
    outline: 2px solid var(--color-brand-strong);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }
}
```

No `prefers-color-scheme: dark` — see §12.

**A loose color in a component is a bug.** No `#62AFFC` or `text-[#0F2A47]`
inside a `.tsx`: only `bg-brand`, `text-foreground`, `border-border`, etc.
Worth adding a lint rule that bans literal hex in JSX.

---

## 8. Components

### 8.1 Buttons

Default height `40px` (`sm` 32px, `lg` 48px), 20px horizontal padding, `md`
radius, weight 600, `body-sm`.

| Variant         | Rest                                                      | Hover                                  | Use                                                                |
| --------------- | --------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| **Primary**     | `brand` fill, `foreground` text                           | `#4E9EF0` fill, `shadow-md`            | one per screen: Connect Wallet, Create Policy, Activate Protection |
| **Secondary**   | `surface-raised` fill, `border` border, `foreground` text | `border-strong` border, `#F4F8FB` fill | supporting actions                                                 |
| **Ghost**       | transparent, `muted` text                                 | `brand-soft` fill, `brand-strong` text | table and toolbar actions                                          |
| **Link**        | `brand-strong` text, underline on hover                   | —                                      | inline navigation                                                  |
| **Destructive** | `danger-soft` fill, `danger` text, `#F0CFCB` border       | `#F5DDDA` fill                         | revoke, break-glass                                                |

Never fill a button with solid `danger` — the destructive palette is soft by
design, and confirmation comes from `ConfirmDialog`, not visual weight.

States: `disabled` = 40% opacity, no shadow, `cursor-not-allowed`; `loading` =
16px spinner replacing the icon, width preserved, text kept.

### 8.2 Card

`bg-surface`, `lg` radius, 24px padding, `shadow-md`, no border. Clickable
card: `shadow-lg` + `translate-y-[-2px]` on hover, 160ms transition. Featured
card (KPI, agent summary): `xl` radius, 32px padding. Card on top of `surface`
(nested): uses `surface-raised` to stand out.

### 8.3 Status badge

Pill (`radius-full`), 24px height, `0 10px` padding, `mono-sm` at 500,
`bg: *-soft`, `color: *-fg`, 12px icon on the left.

The `Fallback` badge gets a **dashed** 1px border in `warning` in addition to
the amber background. It's the only badge with a different shape treatment,
precisely because the architecture requires that a fallback verdict never be
mistaken for a real 0G verdict (§4.2 of `AEGIS_ARCHITECTURE.md`).

### 8.4 Forms

- Label: `label`, `foreground`, 8px above the field.
- Input: 40px height, `bg surface-raised`, `border` border, `md` radius, 12px
  padding. Focus: `brand` border, 2px ring in `brand-strong` with 1px offset.
- Fields that take technical data (address, hash, amount, nonce) use
  `font-mono`.
- Help text: `caption` in `muted`, 6px below.
- Error: `danger` border, message in `caption`/`danger` with a 12px icon.
  Validation appears on blur, not on every keystroke.
- Amount fields show the token as a suffix inside the input, in `subtle`.

### 8.5 Table / DataTable

Header: `overline` in `muted`, `transparent` background, 1px bottom border.
Rows: 56px height, `surface-raised`, 1px divider, `brand-soft` hover. Numeric
columns right-aligned with `tabular-nums`. Every table needs a `loading`
state (5-row skeleton), an `empty` state (centered `EmptyState`), and a
"no results for this filter" state (distinct message, with "clear filters").

### 8.6 EmptyState

64px illustration or icon in `subtle`, `h3` title, `body` description in
`muted` with at most two lines, one primary CTA. Centered, with at least 64px
of vertical padding. This is an important screen here — the empty dashboard
is the first real state every user sees.

### 8.7 Modal / Dialog

Overlay `rgba(15, 42, 71, 0.24)` with `backdrop-blur-sm`. Panel in
`surface-raised`, `xl` radius, `shadow-xl`, 480px width (560px for forms),
32px padding. Close button in the top-right corner, 32px, ghost variant.
Footer actions right-aligned, primary last.

Destructive-action `ConfirmDialog`: alert icon in `danger-soft`, a list of
what's about to happen, and — for break-glass and revocation — a field
requiring the agent's name to be typed in.

### 8.8 Toast

Bottom-right corner, `surface-raised`, `lg` radius, `shadow-lg`, 3px bar in
the semantic color on the left, icon + title + optional description.
Duration 5s (errors don't dismiss on their own). Maximum 3 stacked.

### 8.9 Tabs

Underline, not pill. Active tab: `foreground` text (600) with a 2px bar in
`brand`. Inactive: `muted`. Hover: `foreground`.

### 8.10 Sidebar

`bg surface`, no right border (the contrast with `background` already
separates it). Item: 40px height, `md` radius, 18px icon + `body-sm` label.
Active: `bg brand-soft`, `brand-strong` text, `brand-strong` icon. Hover:
`bg surface-raised`. Logo at the top, 32px height, directly on `surface`, no
color container. In the collapsed sidebar (72px), only the mark, centered,
keeping the 32px.

---

## 9. Icons and graphic elements

**Library:** [Lucide](https://lucide.dev) — 1.5px stroke, sizes 16 / 18 / 20 / 24. Consistent with the lightness of the typography. Don't mix libraries.

Default icon color: `muted`. Active/interactive: `brand-strong`. Inside
badges: inherits the status color.

**Decorative 3D shapes** (Comp.vc reference): allowed on the landing page, in
empty states, and at the top of featured sections. Rules:

- Palette restricted to `brand` and `surface` tones, always at ≤ 40% opacity.
- Matte surface with a soft gradient — no specular highlight, metal, or
  glass.
- Always behind the content, never overlapping text.
- Maximum two elements per viewport.
- Zero in the app shell (dashboard, tables, forms) — there, the decoration
  is the whitespace.

---

## 10. Motion

Discrete and short. Excessive motion reads as instability, which is the
opposite of what the product sells.

| Interaction                | Duration               | Curve                        |
| -------------------------- | ---------------------- | ---------------------------- |
| Hover, focus, color change | 120ms                  | `ease-out`                   |
| Card elevation, dropdown   | 160ms                  | `cubic-bezier(0.2, 0, 0, 1)` |
| Modal, drawer              | 220ms                  | `cubic-bezier(0.2, 0, 0, 1)` |
| Page / list entry          | 240ms, fade + 8px rise | `ease-out`                   |

The **only** continuous animation allowed is the in-progress step of the
`ReceiptTimeline` and the simulator: a slow (1.6s) opacity pulse between 60%
and 100%. No infinite spinners where a skeleton would do.

Respect `prefers-reduced-motion: reduce` — in that case, only opacity
transitions, no displacement.

---

## 11. Accessibility

- Minimum contrast **4.5:1** for text and **3:1** for component borders and
  meaningful icons. The verified ratios are in the §3 tables.
- Focus always visible, in `brand-strong`, with a 2px offset. Never
  `outline: none` without a replacement.
- Minimum touch target 44×44px on mobile.
- Color is never the only carrier of information: status carries icon and
  text.
- Every table has a `<caption>` or `aria-label`; every icon-button has an
  `aria-label`.
- Modal has trapped focus, `Esc` closes it, focus returns to the trigger.
- Async changes (verdict arrived, transaction indexed) announced via
  `aria-live="polite"`.
- Correct heading hierarchy: one `h1` per page, no skipped levels.

---

## 12. Theme

**Light-only for now.** The palette was built for a light background and the
contrast ratios in §3 only hold for it. Remove the
`@media (prefers-color-scheme: dark)` block from the scaffold's
`globals.css` — leaving it makes Next darken the background on machines with
a dark theme and breaks everything.

TODO: if dark mode comes later, it requires a second round of token
derivation and contrast re-verification; it is not an automatic inversion.

---

## 13. Code organization

Reference: [`anthropics/claude-cookbooks`](https://github.com/anthropics/claude-cookbooks).
What we adopt from it — the structure is organized **by capability**, with
self-contained, copy-paste-ready examples going from fundamental to advanced:

- **Group by capability, not by file type.** A feature carries its
  components, hooks, types, and fixtures together, instead of spreading them
  across global `components/`, `hooks/`, and `types/` folders.
- **Self-contained module.** Each feature should be readable without opening
  five folders — it's what makes the reference notebooks work in isolation.
- **From simple to advanced.** Base component first, composition after; no
  UI component knows business logic.

```
app/                      routes (App Router) — thin pages, composition only
components/
  ui/                     primitives: Button, Card, Badge, Input, Table, Dialog
  layout/                 AppShell, Sidebar, Topbar
features/
  agents/                 components/ · hooks/ · types.ts · fixtures.ts
  policies/
  receipts/
  simulator/
lib/
  api/                    swappable data layer — TODO(backend): swap fixtures for real calls
  fixtures/                local fixtures — TODO(backend): remove once the backend exists
  types/                  shared contracts (mirror the architecture)
  utils/                  formatters: address, amount, date, hash
styles/                   tokens beyond globals.css, if needed
docs/                     this document and the others
```

### 13.1 Conventions

- Server Components by default; `"use client"` only where there's state or an
  event, and as deep in the tree as possible.
- Names: component `PascalCase.tsx`, hook `useCamelCase.ts`, utility
  `camelCase.ts`.
- Technical data formatting centralized in `lib/utils/format.ts`
  (`truncateAddress`, `formatAmount`, `formatHash`, `formatRelativeTime`) —
  no screen formats a hash by hand.
- UI components don't fetch. Data flows down through props or comes from
  `lib/api` in the route's Server Component.
- Every `components/ui` primitive accepts `className` and forwards `ref`.

### 13.2 When real AI enters the picture

There's no AI feature in the front end yet (the agent is provisioned by the
backend), but when there is — natural-language explanation of a verdict,
policy-builder assistant — the reference's practices apply:

- API key **never** on the client. The call goes out from a Route Handler or
  Server Action.
- Prompts in versioned files (`lib/ai/prompts/`), not in a template string in
  the middle of a component.
- Structured responses with a typed schema, validated before rendering.
- Streaming with a visible "generating" state, and always a deterministic
  fallback if the model fails — same principle as the 0G fallback.
- Model output is clearly labeled as AI-generated. In an audit product, model
  text can't pass for on-chain data.

---

## 14. Review checklist

Before merging any screen:

- [ ] No literal hex in the component — only tokens.
- [ ] Manrope for text, JetBrains Mono on every piece of technical data.
- [ ] Blue `#62AFFC` only as a sparing accent; blue text uses `brand-strong`.
- [ ] Primary button is `brand` with an `#0F2A47` label, not white.
- [ ] `loading`, `empty`, `error`, and `no-results` states implemented.
- [ ] Shadow at most `shadow-lg` (`xl` only in modals).
- [ ] Focus visible on every interactive element.
- [ ] Status has icon + text, not just color.
- [ ] Hash and address truncated in the 6+4 pattern, with copy.
- [ ] Space between sections ≥ 48px; nothing touching the card's edge.
- [ ] Works at 1280px and at 375px.
