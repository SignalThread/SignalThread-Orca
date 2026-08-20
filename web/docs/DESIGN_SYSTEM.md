# Planner Dash Design Foundation

`@signalthread/ui` is the shared design-system source of truth for Planner OS product surfaces. Claude design-system exports are reference material only. They can validate the direction of the existing system, but generated HTML, JSX, CSS, or font imports should not be copied into product code.

## Source Of Truth

Use `packages/signalthread-ui` for shared tokens, primitives, product shell pieces, table states, badges, and tone resolution.

The current gallery lives at `web/app/design-system/page.tsx`. It should demonstrate real exported `@signalthread/ui` components wherever practical, with local styling reserved for documentation layout and specimens.

## Approved P0 Direction

- Preserve the current SignalThread look and feel.
- Preserve canvas `#f8f8fb`.
- Preserve primary action `#28439A`.
- Preserve shell/nav dark `#0B1638`.
- Preserve white border-led cards and restrained shadows.
- Preserve slate text hierarchy.
- Preserve compact operational density for dashboard workflows.
- Preserve `statusToneMap`, `roleToneMap`, `resolveStatusTone`, and `resolveRoleTone`.

## Font

Use Montserrat as the primary product/UI sans font through `next/font/google`.

Use Geist Mono only for monospace contexts such as code, token values, IDs, logs, and diagnostics.

Do not import Claude's Geist Sans font CSS. Do not switch the primary UI font to Geist without explicit brand approval.

## Surfaces

Keep Planner Dash light mode. Use the off-white canvas, white cards, subtle slate borders, and restrained shadows for operational shells, tables, panels, headers, and inspectors.

Cards should remain border-led and quiet. Do not globally alter radius or elevation in P0.

## Brand Palette

The SignalThread brand palette is available for logo, identity, marketing, and occasional brand/signal accent moments:

- Navy `#183060`
- Blue `#3078C0`
- Cyan `#30A8D8`
- Signal Orange `#F07830`

Signal Orange is not a product semantic status color. Do not use it to replace warning, danger, primary action, or status tones.

## Pills And Badges

Use the centralized tone system from `@signalthread/ui`.

Status and role labels should resolve through the existing shared maps rather than one-off local color choices or generated Claude maps.

## Forms And Validation

Use shared form primitives and `FormField` for labels, helper text, error text, required markers, disabled state, and accessible invalid state wiring.

Validation states should use clear red text/borders and should not require custom page-level styling.

## Tables

Keep the existing compositional `DataTable` API.

Use shared table state helpers for empty, loading, and error states. Horizontal table scrolling is acceptable for dense operational data.

Do not replace the table API with Claude's generated columns/rows implementation as part of P0.

## Operational Density

Planner Dash screens should feel quiet, scannable, and work-focused. Prefer compact controls, predictable filter rows, dense but legible tables, and clear panel hierarchy.

Avoid decorative dashboard treatments that make repeated workflows slower to scan.

## Deferred Or Rejected For P0

- Geist Sans as the primary UI font.
- Importing Claude generated HTML, JSX, or global CSS.
- Importing Claude's Google font CSS.
- Replacing `packages/signalthread-ui`.
- Global shell redesign.
- Global radius or elevation change.
- DataTable API replacement.
- Broad Planner Dash restyle.
- One-off page fixes that bypass `@signalthread/ui`.

## Adoption

Safe refinements should land in `packages/signalthread-ui` first, then the gallery/docs, then real app screens only when adoption is explicitly approved.

Changes to `packages/signalthread-ui` can affect screens that already import shared components. Screens with local shell or component implementations will not change until they intentionally adopt the shared package.
