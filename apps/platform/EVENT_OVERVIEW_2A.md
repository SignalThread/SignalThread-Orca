# Connected event overview (prototype 2a)

The `/events/[eventId]` overview implements **2a Event overview · five products** from `SignalThread Platform Prototype (2).html`. The original bundled HTML was decoded and its source inspected before edits, then reopened in Chromium for section-by-section comparison. The prototype explicitly supersedes 1a; 2b is its earlier lifecycle concept. No alternative dashboard was substituted.

## Implementation and existing contracts

- `app/_components/platform-shell.tsx` owns the authenticated header across Platform routes: organization context, account identity, Events navigation and POST sign-out. The event layout supplies the selected event’s owning organization.
- `app/(event)/events/[eventId]/_components/` contains the event heading, connected platform rail, dominant navy event object, varied lifecycle bands and Now marker, shared identity rail, provenance cards, ranked attention ledger, single Go deeper ledger and subordinate metadata footer.
- `lib/server/event-overview.ts` binds canonical registry services to the testable loader in `lib/event-overview/load.ts`. It uses the existing active organization membership and entitlement derivation. Unauthorized, unknown and malformed event IDs disclose no event information. Product sources run only after authorization.
- `lib/event-overview/view-model.ts` derives participation, lifecycle, states, counts, attention severity and actions. `ProductFeedSource` and `InsightSource` are typed integration boundaries, with explicit event and organization IDs. Mis-scoped data is discarded.
- All product actions use `buildLaunchHref` and the existing `/api/launch/[product]?event_id=…` authorization and one-time handoff. No new SSO path or product URL builder was introduced. Insights identify a product target, never a caller-supplied destination URL. The launcher currently opens the selected event; specific work-item handoffs are not yet supported, so action labels honestly say “Open [product]”.
- Shared `@signalthread/ui` badges/buttons, the `--st-*` design tokens and Geist/Geist Mono are reused. Product colors, spacing, connector, bands, dense ledgers and 16px surfaces come from 2a. Desktop retains the 1080px content area within the prototype’s 1280px canvas; smaller widths reflow the matrix and ledgers. Insights use three, two and one columns.

## Real data and integration limits

Platform Core supplies the selected event ID, name, slug, registry status and dates; owning organization, viewer role and active organization product entitlements; and optional venue/timezone metadata. The lifecycle uses event-local calendar days, with a disclosed UTC fallback when timezone is absent or invalid. Invalid date ranges have no invented Now marker. Event creation preserves the selected date across UTC offsets and DST.

There is currently no separate Platform event-product enablement table. Participation follows the existing organization-wide entitlement contract; no parallel entitlement authority was added.

At inspection, the established secure launcher supports OrcaOS and Pulse when their deployment URLs are configured. Registration, Housing and Lead Retrieval are registered products but have no supported Platform handoff in that registry. They appear only when entitled, with Setup/unavailable states. Separate Lead Retrieval work was in progress and was left untouched.

No production service-to-service summary or cross-product intelligence source is connected. Configured launches therefore show **Available**, never a fabricated active product state. Product counts remain unavailable; the intelligence section explains the missing sources. The attention ledger uses genuine registry setup gaps and explicitly discloses incomplete product coverage. Reported product attention and cross-product insights render when supported sources are supplied. OrcaOS can carry pre-live Registration/Housing planning blockers through this boundary, but no such blocker is manufactured today.

The shared rail describes Platform identity and canonical event context, not an already-shared attendee database or one physical product datastore. Each product remains authoritative for its operational data.

## Schema

`supabase/migrations/20260907120000_platform_core_event_venue_timezone.sql` adds optional `events.venue` and `events.timezone` plus an idempotently guarded timezone-format constraint. Existing rows and access rules are unchanged. Event and event-list readers fall back to their core columns on projects without the migration. The admin create-event form validates timezone and real calendar days. Migration application remains a separate deployment step; no database migration or `db push` was run.

## Verification

- `npm run test --workspace=platform`: 150 passing tests, including source contracts, rendered components, date/timezone cases, scope filtering, loader authorization, secure actions, empty/loading/error states and existing Platform auth/launcher regressions.
- `npm run typecheck --workspace=platform`, `npm run lint --workspace=platform`, and `git diff --check`: pass.
- `npm run test:overview:browser --workspace=platform`: 72 combinations (320, 375, 768, 1024, 1280 and 1536px; zero through five products; reported and unavailable data), plus long-content overflow checks, During/After markers, provenance grids, hover, secure-launch clicks and Events back-navigation.
- Browser verification renders the actual production components, compiled Tailwind CSS and built Geist fonts with explicitly test-only fixtures. It does not add a demo route or auth bypass. Screenshots are written under `/private/tmp/signalthread-overview-verification` by default. This is component/browser verification, not a live authenticated customer-data session.
- `npm run build --workspace=platform -- --webpack`: passes. The default Turbopack build hits an environment restriction binding worker sockets; webpack is the supported compiler fallback. Next also reports the existing middleware-to-proxy deprecation.

The work completes the existing uncommitted 2a implementation on `platform/event-overview-2a`. No commit, merge, push or PR was made for this task. Unrelated Pulse, Orca, Lead Retrieval and root workspace work was preserved.
