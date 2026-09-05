import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const workspaceSource = fs.readFileSync(path.join(process.cwd(), 'components/events/SimpleEventWorkspace.tsx'), 'utf8')
const deploymentSource = fs.readFileSync(path.join(process.cwd(), 'components/events/EventDeploymentWorkspace.tsx'), 'utf8')

describe('Simple Event workspace', () => {
  it('keeps the lightweight event-wide survey actions on the canonical builder, Signals, and Deploy routes', () => {
    expect(workspaceSource).toContain('Your surveys')
    expect(workspaceSource).toContain('This survey covers the whole event — nothing to assign.')
    expect(workspaceSource).toContain('Add Survey')
    expect(workspaceSource).toContain('Edit')
    expect(workspaceSource).toContain('Signals')
    expect(workspaceSource).toContain('Deploy')
    expect(workspaceSource).toContain('/surveys/new?')
    expect(workspaceSource).toContain('/dashboard?')
    expect(workspaceSource).toContain("tab: 'deploy'")
  })

  it('uses the existing Deploy workspace and exposes an optional return action', () => {
    expect(deploymentSource).toContain('onDone?: () => void')
    expect(deploymentSource).toContain('{onDone && <Button')
    expect(deploymentSource).toContain('>Done</Button>')
  })

  it('uses the shared entity-card treatment for each survey', () => {
    expect(workspaceSource).toContain("import { EventEntityCard, EventEntityListShell } from '@/components/events/EventEntityCard'")
    expect(workspaceSource).toContain('<EventEntityListShell className="space-y-3">')
    expect(workspaceSource).toContain('<EventEntityCard')
  })
})
