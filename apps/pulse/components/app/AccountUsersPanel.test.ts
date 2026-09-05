import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'components/app/AccountUsersPanel.tsx'), 'utf8')

describe('account-scoped Users UI', () => {
  it('shows canonical invite and login lifecycle details', () => {
    expect(source).toContain('Invited')
    expect(source).toContain('Joined')
    expect(source).toContain('Last login')
    expect(source).toContain("u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'")
    expect(source).toContain('Invite expired')
    expect(source).toContain('Access removed')
  })

  it('uses account-scoped overflow actions without exposing platform controls', () => {
    expect(source).toContain('Resend invite')
    expect(source).toContain('Cancel invite')
    expect(source).toContain('Remove access')
    expect(source).toContain('Generate login OTP')
    expect(source).toContain('Change role')
    expect(source).toContain('<EventRowActionOverflow')
    expect(source).toContain('menuClassName="w-52"')
    expect(source).toContain('sticky right-0')
    expect(source).toContain('Remove ${confirmAction.name}')
    expect(source).not.toContain('Open account')
    expect(source).not.toContain('Platform admin')
  })

  it('uses a nested role submenu instead of embedding a role select in the action menu', () => {
    expect(source).toContain('Change role <span aria-hidden="true">›</span>')
    expect(source).toContain('role="menuitemradio"')
    expect(source).toContain('aria-checked={isCurrent}')
    expect(source).toContain('aria-label="Current role"')
    expect(source).toContain("u.role === nextRole")
    expect(source).not.toContain('Change role<select')
    expect(source).toContain('role="separator"')
  })
})
