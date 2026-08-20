# SignalThread Design System

The shared product UI system behind **SignalThread** — the event-operations platform whose surfaces include **Planner Dash**, **Lead Retrieval**, the marketing website, and future SignalThread apps. This system is the single source of truth for tokens, components, and full-screen recreations so every surface feels like one polished product.

It is grounded in the live `@signalthread/ui` package and the Planner Dash codebase — soft canvas backgrounds, white border-led cards, slate text, a deep indigo-blue primary, compact SaaS density, and operational dashboard patterns (shells, tables, forms, filters, badges, alerts).

> **Brand note.** The company / platform brand is **SignalThread** (logo in `assets/`). **Planner Dash** is a product surface inside it. In the live build the admin shell is also labelled "OrcaOS" in places — treat that as product-shell chrome; the design-system brand is SignalThread.

## Sources

These informed the system. You may not have access, but they are recorded so you (or a teammate) can go deeper:

- **GitHub:** `https://github.com/akamyab12/plannerdash` — the Next.js Planner Dash app. Read for ground-truth styling. Key files:
  - `app/globals.css` — base tokens (`--background:#f8f8fb`, slate foreground, Geist).
  - `app/(shell)/layout.tsx`, `app/(shell)/_components/sidebar-nav.tsx` — shell + nav (primary `#28439A`, rounded-xl items).
  - `app/(shell)/events/page.tsx` — table, search/filter, status badges, modal, primary button.
  - `app/(public)/login/page.tsx` — OTP login flow.
  - *Explore this repo further to build higher-fidelity Planner Dash designs.*
- **Live reference:** `https://pd.signalthread.ai/design-system` — the design-system gallery (stat cards, count tabs, segmented controls, alerts, table states, status & role tone matrix).
- **Uploads** (`uploads/`): the SignalThread logo and three product screenshots (Platform Users, Manage accounts, design-system gallery).

> The brief referenced a `packages/signalthread-ui` monorepo and `web/app/...` paths; those don't exist in the public `plannerdash` repo, so the system is reconstructed from the single-app codebase + screenshots + live gallery. If you can share the monorepo, the system can be tightened further.

---

## Content fundamentals

How SignalThread writes copy:

- **Voice:** operational, plain, and exact — it tells you what a control *does*, not how it feels. E.g. "Sends an invite email, upserts the app user, and ensures org + event membership in one step."
- **Person:** mostly **imperative / system-third-person** ("Invite and provision user", "Provisioned org membership + 12 event memberships"). It rarely says "you"; never "we". Helper text describes the field's role: "Used for invite and sign-in delivery."
- **Casing:** **Sentence case** for titles, descriptions, and buttons ("New Event", "Invite user", "Clear filters"). **UPPERCASE** is reserved for table headers, eyebrow labels, role keys (`SUPER ADMIN`, `MEMBER`), and enum values shown verbatim from the data model (`ACTIVE`, `DRAFT`).
- **Eyebrows:** tiny uppercase section kickers above titles ("PANEL", "PRODUCT COMPONENTS", "ACCOUNTS").
- **Numbers & IDs:** real and specific — counts ("1,248", "36"), currency with no cents ("$420,000"), slugs (`atlas-events`), and raw IDs in mono (`org_atlas`, `dd0023ec-5204-…`).
- **Status language:** short status words map to a fixed tone — Active/Approved/Ready → success, Draft/In Review/Needs setup → warning, Rejected/Blocked → danger, Scheduled → info.
- **Tone:** confident and calm. Errors state the fact and offer the next action ("Unable to load accounts — Check access or retry the request." + Retry).
- **No emoji.** No exclamation marks. No marketing fluff in-product.

---

## Visual foundations

- **Backgrounds:** a single soft canvas `#f8f8fb` behind everything; content sits on **white cards**. No gradients, no imagery, no textures, no full-bleed art in-product. Flat and quiet.
- **Cards:** white, **1px slate-200 border**, **16px** radius, and only a *whisper* shadow (`0 1px 2px rgba(15,23,42,.04)`) — cards are **border-led, not shadow-led**. The only real shadow in the system is on **modals** (`0 24px 60px rgba(15,23,42,.20)`).
- **Color:** deep indigo-blue primary `#28439A` (hover `#243d8e`), heading/link blue `#1F3D8F`. A full **slate** ramp carries text, borders, and surfaces. Semantic tones are emerald (success), amber (warning), rose (danger), blue (info), and violet for elevated roles (SUPER ADMIN / OWNER).
- **Type:** **Geist** sans for everything, **Geist Mono** for IDs and codes. Base 15px. Compact scale — page titles 32/36 semibold, sections 24, card titles 20, body 14, and a 10px uppercase micro-label (tracking .05em) for table headers and eyebrows.
- **Density:** compact SaaS. 44px controls (`h-11`), 48px nav items, 80px header/logo blocks, 280px sidebar, 1100px content max.
- **Radius:** 6 / 12 / 16 / 20px + pill. Inputs and nav use 12px; buttons and cards use 16px; badges and avatars are pills.
- **Borders:** slate-200 is the default divider everywhere; slate-300 on hover/stronger emphasis.
- **Shadows:** essentially none on resting surfaces — depth comes from borders and the canvas/card contrast. Reserve shadow for floating layers (modals, popovers).
- **Hover states:** subtle background shift — primary darkens (`#28439A`→`#243d8e`); secondary/ghost pick up a slate-50/100 fill; nav items get a slate-100 wash; clickable cards darken their border to slate-300. **No lift/translate.**
- **Press / focus:** focus shows a 2px primary outline / 3px primary ring (`color-mix` of `#28439A` @ 35%). No shrink animation.
- **Animation:** minimal and functional. Short (120–180ms) background/border transitions on `cubic-bezier(0.2,0,0,1)`; a gentle table-loading shimmer. No bounces, parallax, or decorative motion.
- **Transparency / blur:** rarely — only the modal scrim (`rgba(2,6,23,.45)`). No glass/blur surfaces in-product.
- **Badges:** pill, tinted-50 background, tinted-200 border, tinted-700 text, with a 6px leading dot for status; role badges are uppercase with tracking and no dot.
- **Imagery vibe:** the product is imagery-free; brand imagery (the logo) is navy + a blue→cyan signal waveform with an orange pulse — cool, technical, precise.

---

## Iconography

- **System:** [**Lucide**](https://lucide.dev) — the exact set used in the codebase (`lucide-react`), 24×24, **2px stroke**, round caps/joins, no fill. Consistent line weight everywhere.
- **In code:** import from `lucide-react` (e.g. `LayoutGrid`, `CalendarDays`, `Wallet`, `UsersRound`, `Plus`, `Search`, `Funnel`, `X`, `Bell`).
- **In these design-system files:** the in-browser bundler can't resolve npm packages, so cards and UI kits use **inline Lucide geometry** (the same paths) via a small `mk()` helper / `window.STIcons`. When you build production code, use real `lucide-react` instead.
- **Sizing:** 18–20px inline with text and in controls; 16px in dense/`sm` contexts.
- **No emoji, no unicode pictographs, no custom one-off SVG icons** — stay within Lucide so stroke weight and metrics match.
- **Logo:** `assets/signalthread-logo.png` (transparent; navy wordmark + signal waveform). Use on white/light canvas; on dark, invert to white. Don't recolor the mark itself.

---

## Index / manifest

**Root**
- `styles.css` — global entry point (import-only). Consumers link this.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css` (radius/elevation/layout/motion), `fonts.css` (Geist), `base.css` (resets).
- `assets/` — `signalthread-logo.png`.
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Brand).
- `SKILL.md` — Agent-Skill entry point for using this system elsewhere.

**Components** (`components/<group>/` — `Name.jsx` + `Name.d.ts` + `Name.prompt.md` + one `@dsCard` HTML per dir)
- `buttons/` — **Button**, **IconButton**
- `forms/` — **Input**, **Select**, **Textarea**, **FormField**, **Checkbox**, **Switch**
- `feedback/` — **Alert**, **Badge**, **RoleBadge**, **StatCard**
- `navigation/` — **Tabs**, **SegmentedControl**
- `layout/` — **Card**, **PanelHeader**
- `data/` — **DataTable** (with empty / loading / error states)

**UI kits** (`ui_kits/<product>/`)
- `planner-dash/` — interactive admin recreation: login, shell, Platform Users, Events, dashboard.

---

## Recommendations (system maturity)

Observations from reconciling the codebase, gallery, and screenshots — things to align next:

1. **Token drift:** the app hardcodes `#28439A`, `#1F3D8F`, `#f8f8fb`, and per-status Tailwind classes inline. Adopt the semantic aliases here (`--accent-primary`, `--text-link`, `--surface-canvas`, the status tones) so colors live in one place.
2. **Radius inconsistency:** primary CTAs use `rounded-2xl` (16) while modal buttons use `rounded-xl` (12). Standardize on **16px buttons / 12px inputs** (encoded in `--radius-lg` / `--radius-md`).
3. **Status tone gaps:** the events table only styles Active vs. neutral; the gallery defines a fuller matrix. Use the central `Badge status="…"` resolver so every surface shows the same tones.
4. **Missing states:** tables need first-class **empty / loading / error** states (now in `DataTable`) instead of ad-hoc `colSpan` rows.
5. **Hierarchy:** headers mix `font-extrabold`/`font-semibold` and several sizes; the type scale here collapses them to page/section/card-title roles.
6. **Coverage to add next:** Toast, Tooltip, Dropdown menu, Pagination, Breadcrumbs, Avatar group, and a real Dialog component (the modal is currently inlined per page).
