import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const provisionPageSource = fs.readFileSync(
  path.join(process.cwd(), 'app/admin/provision/page.tsx'),
  'utf8',
)

describe('Platform Admin provisioning form', () => {
  it('offers retail and events account modes', () => {
    expect(provisionPageSource).toContain("type ProvisionAccountMode = 'retail' | 'events'")
    expect(provisionPageSource).toContain("label: 'Retail'")
    expect(provisionPageSource).toContain("label: 'Events'")
  })

  it('keeps retail package labels and canonical tier values', () => {
    expect(provisionPageSource).toContain('const RETAIL_PLAN_OPTIONS')
    expect(provisionPageSource).toContain("value: 'starter'")
    expect(provisionPageSource).toContain("label: 'Starter'")
    expect(provisionPageSource).toContain("detail: 'Best for one Location/Team'")
    expect(provisionPageSource).toContain("value: 'growth'")
    expect(provisionPageSource).toContain("label: 'Growth'")
    expect(provisionPageSource).toContain("detail: 'Supports up to 5 Locations/Teams'")
  })

  it('shows events package labels while preserving starter/growth submitted values', () => {
    expect(provisionPageSource).toContain('const EVENTS_PLAN_OPTIONS')
    expect(provisionPageSource).toContain("label: 'Event Launch'")
    expect(provisionPageSource).toContain("detail: 'One launch-ready event voice survey workspace.'")
    expect(provisionPageSource).toContain("label: 'Event Scale'")
    expect(provisionPageSource).toContain(
      "detail: 'Expanded workspace for multiple event teams, targets, or activations.'"
    )
    expect(provisionPageSource).toContain(
      "const planOptions = accountMode === 'events' ? EVENTS_PLAN_OPTIONS : RETAIL_PLAN_OPTIONS"
    )
    expect(provisionPageSource).toContain('plan: formData.plan')
  })

  it('routes retail provisioning to the retail endpoint and events provisioning to the events endpoint', () => {
    expect(provisionPageSource).toContain("accountMode === 'events'")
    expect(provisionPageSource).toContain("'/api/admin/provision-events'")
    expect(provisionPageSource).toContain("'/api/admin/provision-retail'")
  })
})
