import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const profilePageSource = fs.readFileSync(
  path.join(process.cwd(), 'app/app/settings/profile/page.tsx'),
  'utf8',
)

const accountSettingsRouteSource = fs.readFileSync(
  path.join(process.cwd(), 'app/api/app/account/settings/route.ts'),
  'utf8',
)

const eventSettingsPanelSource = fs.readFileSync(
  path.join(process.cwd(), 'components/events/EventSettingsPanel.tsx'),
  'utf8',
)

describe('profile settings product IA', () => {
  it('loads account type before showing product-specific settings IA', () => {
    expect(accountSettingsRouteSource).toContain('accountType: true')
    expect(accountSettingsRouteSource).toContain('account: {')
    expect(accountSettingsRouteSource).toContain('accountType: account.accountType')
    expect(profilePageSource).toContain("import { isEventsAccount } from '@/lib/account-product-mode'")
    expect(profilePageSource).toContain('fetch(`/api/app/account?account=${accountSlug}`')
    expect(profilePageSource).toContain('const isEventsProfile = isProductModeKnown && isEventsAccount(accountType)')
    expect(profilePageSource).toContain('const isRetailProfile = isProductModeKnown && !isEventsProfile')
    expect(profilePageSource).toContain("typeof data.account?.accountType === 'string'")
  })

  it('keeps Events profile settings out of SMB locations and Google Review setup', () => {
    const eventsTabsBlock = profilePageSource.match(/const eventsProfileTabs[\s\S]*?const retailProfileTabs/)?.[0] || ''

    expect(profilePageSource).toContain("setActiveTab(isRetailProfile ? 'locations' : 'consent')")
    expect(profilePageSource).toContain("if (!isRetailProfile && (activeTab === 'locations' || activeTab === 'billing'))")
    expect(profilePageSource).toContain("{!isEventsProfile && activeTab === 'locations' && (")
    expect(profilePageSource).toContain('<GoogleReviewLinkAccordion />')
    expect(eventsTabsBlock).toContain("key: 'consent', label: 'Consent Screen'")
    expect(eventsTabsBlock).toContain("key: 'event-settings', label: 'Event Settings'")
    expect(eventsTabsBlock).toContain("key: 'branding', label: 'Branding'")
    expect(eventsTabsBlock).toContain("key: 'users', label: 'Users'")
    expect(eventsTabsBlock).not.toContain("key: 'organization'")
    expect(eventsTabsBlock).not.toContain("key: 'billing'")
    expect(eventsTabsBlock).not.toContain("key: 'locations'")
    expect(profilePageSource).not.toContain('Event workspaces, surveys, feedback points, QR codes, and kiosk links are managed inside each Event.')
    expect(profilePageSource).not.toContain('Events product mode')
    expect(profilePageSource).not.toContain('Back to Events')
    expect(profilePageSource).toContain('await fetchLocations()')
    expect(profilePageSource).toContain('if (!accountTypeOverride || isEventsAccount(accountTypeOverride))')
    expect(profilePageSource).toContain("{isRetailProfile && activeTab === 'billing' && (")
    expect(profilePageSource).toContain('Manage organization settings, consent, branding, and team users.')
  })

  it('keeps Events profile settings compact while leaving the SMB tab list intact', () => {
    expect(profilePageSource).toContain('const isCompactEventsProfile = !isRetailProfile')
    expect(profilePageSource).toContain("? 'text-2xl sm:text-[1.75rem] font-bold")
    expect(profilePageSource).toContain("? 'flex flex-wrap gap-0.5 rounded-lg")
    expect(profilePageSource).toContain("const profileCardPadding = isCompactEventsProfile ? 'sm' : 'md'")
    expect(profilePageSource).toContain("setActiveTab(isRetailProfile ? 'locations' : 'consent')")
  })

  it('uses Settings as the one canonical Users surface, including deep links', () => {
    expect(profilePageSource).toContain("requestedTab === 'users'")
    expect(profilePageSource).toContain("setActiveTab('users')")
    expect(profilePageSource).toContain('<AccountUsersPanel accountSlug={accountSlug} />')
  })

  it('hosts the single Event Settings form and deletion flow inside the Event Settings tab', () => {
    expect(profilePageSource).toContain("searchParams.get('tab')")
    expect(profilePageSource).toContain("requestedTab === 'event-settings'")
    expect(profilePageSource).toContain('<EventSettingsPanel accountSlug={accountSlug} eventId={eventId} />')
    expect(eventSettingsPanelSource).toContain('/api/app/events/${encodeURIComponent(eventId)}/settings?account=${encodeURIComponent(accountSlug)}')
    expect(eventSettingsPanelSource).toContain('Event-wide listening window')
    expect(eventSettingsPanelSource).toContain('Danger Zone')
    expect(eventSettingsPanelSource).toContain('Confirm event name')
    expect(eventSettingsPanelSource).toContain('confirmationName: deleteConfirmation')
    expect(eventSettingsPanelSource).toContain("method: 'DELETE'")
  })

  it('offers compact saved consent bullet styles and shares them with the live preview', () => {
    expect(profilePageSource).toContain("from '@/lib/consent-bullet-style'")
    expect(profilePageSource).toContain('aria-label="Consent bullet style"')
    expect(profilePageSource).toContain('CONSENT_BULLET_STYLES.map')
    expect(profilePageSource).toContain('bulletStyle: consent.bulletStyle')
    expect(profilePageSource).toContain('const consentBulletGlyph = getConsentBulletGlyph(consentBulletStyle)')
    expect(profilePageSource).toContain('consent-preview-bullet-${consentBulletStyle.toLowerCase()}')
  })

  it('preserves SMB locations and Google Review copy for retail accounts', () => {
    const retailTabsBlock = profilePageSource.match(/const retailProfileTabs[\s\S]*?const profileTabs/)?.[0] || ''

    expect(profilePageSource).toContain("key: 'locations', label: 'Locations/Teams'")
    expect(retailTabsBlock).toContain("key: 'locations', label: 'Locations/Teams'")
    expect(retailTabsBlock).toContain("key: 'billing', label: 'Billing'")
    expect(profilePageSource).toContain('How to Find Your Google Review Link')
    expect(profilePageSource).toContain('+ Add Location/Team')
    expect(profilePageSource).toContain('Create a Location or Team to start collecting feedback.')
    expect(profilePageSource).toContain('Manage where feedback is collected and optional Google Review links')
  })
})
