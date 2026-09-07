import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'components/admin/PlatformUsersPageClient.tsx'), 'utf8')

describe('Platform Admin Users UI', () => {
  it('provides the cross-account columns, filters, and compact overflow actions', () => {
    for (const label of ['Name', 'Email', 'Account', 'Role', 'Status', 'Invite status', 'Invited date', 'Last login', 'Created', 'Actions']) {
      expect(source).toContain(`'${label}'`)
    }
    expect(source).toContain('Search name or email')
    expect(source).toContain('All accounts')
    expect(source).toContain('Generate OTP')
    expect(source).toContain('Resend invite')
    expect(source).toContain('Open account')
    expect(source).toContain('Manage account access')
  })

  it('shows compact primary plus membership counts and limits access management to regular ADMIN users', () => {
    expect(source).toContain('row.accountCount > 1')
    expect(source).toContain('row.accountCount - 1')
    expect(source).toContain("row.kind === 'USER' && row.role === 'ADMIN'")
    expect(source).toContain('<PlatformAccountAccessDrawer')
  })

  it('shows OTP once without exposing an action link', () => {
    expect(source).toContain('It is not saved by SignalThread.')
    expect(source).not.toContain('action_link')
  })

  it('uses shared semantic badges for user and invite states', () => {
    expect(source).toContain("import { Badge } from '@/components/ui/Badge'")
    expect(source).toContain("ACTIVE: 'success'")
    expect(source).toContain("INVITED: 'warning'")
    expect(source).toContain("DEACTIVATED: 'error'")
    expect(source).toContain("ACCEPTED: 'success'")
    expect(source).toContain("PENDING: 'warning'")
    expect(source).toContain('variant={userStatusVariant[row.status]}')
    expect(source).toContain('variant={inviteStatusVariant[row.inviteStatus]}')
  })

  it('uses centralized short dates with keyboard-accessible full-timestamp tooltips', () => {
    expect(source).toContain('function tableDate')
    expect(source).toContain("dateStyle: 'medium'")
    expect(source).toContain("timeStyle: 'short'")
    expect(source).toContain("import { InfoTooltip } from '@/components/ui/InfoTooltip'")
    expect(source).toContain('ariaLabel={`Full timestamp: ${formatted.full}`}')
    expect(source).toContain("row.lastLoginAt ? <DateCell value={row.lastLoginAt} /> : 'Never'")
  })

  it('keeps actions sticky and avoids repeating fallback email values', () => {
    expect(source).toContain('sticky right-0 z-30')
    expect(source).toContain('sticky right-0 z-20')
    expect(source).toContain('border-l border-zinc-200')
    expect(source).toContain("row.hasDisplayName ? row.email : '—'")
  })

  it('uses the shared portaled overflow menu so actions remain visible at table and viewport edges', () => {
    expect(source).toContain("import { EventRowActionOverflow } from '@/components/events/EventRowActionControl'")
    expect(source).toContain('<EventRowActionOverflow')
    expect(source).toContain('menuClassName="w-64 p-1.5"')
    expect(source).toContain('onOpenChange={(open) => { if (!open) setRolePickerRowKey(null) }}')
    expect(source).not.toContain('<details className="relative">')
    expect(source).not.toContain('Change role<select')
  })

  it('keeps role switching inside the menu surface and retains destructive access controls', () => {
    expect(source).toContain('Back to actions')
    expect(source).toContain('role="menuitemradio"')
    expect(source).toContain('setRolePickerRowKey(row.key)')
    expect(source).toContain('text-red-700')
    expect(source).toContain("row.hasActiveAccess ? 'Deactivate' : 'Reactivate'")
  })
})
