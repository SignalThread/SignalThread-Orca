import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

const homeSource = read('app/app/page.tsx')
const createSource = read('app/app/events/new/page.tsx')
const workspaceSource = read('app/app/events/[eventId]/page.tsx')
const dashboardSource = read('app/app/events/[eventId]/dashboard/page.tsx')
const shellSource = read('components/app/events/EventWorkspaceShell.tsx')

/**
 * Cross-cutting checks for the redesigned three-tier Voice for Events experience.
 * Ensures the tiers form one connected product (Home → Workspace → Command Center)
 * and consistently reuse the shared event-only UI primitives, with real empty
 * states rather than blank boxes.
 */
describe('connected Voice for Events experience', () => {
  it('navigates Home → Setup → Signals and back through the permanent shell', () => {
    // Home → Workspace + Command Center.
    expect(homeSource).toContain('href={href}')
    expect(homeSource).toContain('                    Signals')
    expect(homeSource).toContain('const dashboardHref = `/app/events/${event.id}/dashboard?account=${accountSlug}`')
    // Setup ↔ Signals is owned by one account/event-scoped navigation model.
    expect(shellSource).toContain("{ key: 'setup', label: 'Setup'")
    expect(shellSource).toContain("{ key: 'signals', label: 'Signals'")
    expect(workspaceSource).toContain('activeSection="setup"')
    expect(dashboardSource).toContain('activeSection="signals"')
    expect(workspaceSource).not.toContain('Open Command Center')
    expect(dashboardSource).not.toContain('Back to Workspace')
  })

  it('reuses the shared event-only primitives across the tiers', () => {
    // Home + Workspace + Command Center surfaces share the event-only primitives.
    for (const source of [homeSource, workspaceSource]) {
      expect(source).toContain("@/components/app/events")
    }
    // Home event browser + workspace shell share the event-only primitive language.
    expect(homeSource).toContain('EventsHomeSummaryStrip')
    expect(homeSource).toContain('EventsHomeBrowser')
    expect(homeSource).toContain('EventStatusPill')
    expect(workspaceSource).toContain('EventStatusPill')
    expect(workspaceSource).toContain('EventTabs')
    expect(workspaceSource).toContain('EventAgendaWorkspace')
    expect(workspaceSource).toContain('EventAreasWorkspace')
    expect(workspaceSource).toContain('EventWorkspaceShell')
    expect(dashboardSource).toContain('EventWorkspaceShell')
  })

  it('uses real, intentional empty states (no blank boxes) across the tiers', () => {
    // Home, workspace areas + surveys all use intentional empty-state copy.
    expect(homeSource).toContain('No events yet')
    expect(homeSource).toContain('No events match')
    expect(workspaceSource).toContain('<EventEmptyState')
    expect(workspaceSource).toContain('No Event Areas yet')
    expect(workspaceSource).toContain('No feedback points match your filters')
  })

  it('keeps consistent event terminology and avoids retail/SMB language in event tiers', () => {
    for (const source of [createSource, workspaceSource]) {
      expect(source.toLowerCase()).not.toContain('storefront')
      expect(source).not.toContain('Google Review')
    }
    // Event-domain vocabulary is present.
    expect(workspaceSource).toContain('Collection readiness')
    expect(workspaceSource).toContain('Agenda & sessions')
    expect(workspaceSource).toContain("label: 'Surveys', helper: 'Create & attach surveys'")
    expect(workspaceSource).toContain("detail: 'Create surveys and attach them to sessions or areas.'")
    expect(homeSource).toContain('Your events')
  })
})
