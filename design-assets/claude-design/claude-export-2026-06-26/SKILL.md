---
name: signalthread-design
description: Use this skill to generate well-branded interfaces and assets for SignalThread (and its products Planner Dash, Lead Retrieval, and website), either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc.), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Where things are
- `readme.md` — full design guide: brand context, content fundamentals, visual foundations, iconography, manifest, and maturity recommendations. **Start here.**
- `styles.css` — global entry point; link this one file to inherit every token and font. Import-only.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `fonts.css` (Geist), `base.css`.
- `assets/` — `signalthread-logo.png`.
- `guidelines/` — foundation specimen cards (colors, type, spacing, brand).
- `components/<group>/` — React primitives (`Button`, `Input`, `Select`, `FormField`, `Badge`, `RoleBadge`, `Alert`, `StatCard`, `Tabs`, `SegmentedControl`, `Card`, `PanelHeader`, `DataTable`). Each has a `.d.ts` (props) and `.prompt.md` (usage).
- `ui_kits/planner-dash/` — interactive admin recreation (login, shell, Platform Users, Events).

## Fast rules (see readme.md for the full set)
- **Canvas** `#f8f8fb`; content on **white, border-led cards** (1px slate-200, 16px radius, whisper shadow). Shadows only on modals.
- **Primary** indigo-blue `#28439A` (hover `#243d8e`); links/headings `#1F3D8F`; slate ramp for text/borders.
- **Type:** Geist (sans) + Geist Mono; base 15px; sentence-case copy; UPPERCASE only for table headers, eyebrows, role/enum keys.
- **Icons:** Lucide, 24×24, 2px stroke. In bundler-less HTML, inline Lucide path geometry. No emoji.
- **Density:** 44px controls, compact SaaS spacing. Functional 120–180ms transitions; no decorative motion.
- **Copy:** operational and exact; describe what controls do; no "we", rarely "you"; no emoji.

When in doubt, match the codebase truth in `readme.md` over any screenshot.
