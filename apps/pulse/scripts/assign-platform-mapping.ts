/**
 * Deliberate, human-reviewed assignment of canonical Platform Core ids onto Pulse rows.
 *
 *   npx tsx scripts/assign-platform-mapping.ts user    --pulse-user-id=<id>    --platform-user-id=<uuid>
 *   npx tsx scripts/assign-platform-mapping.ts account --pulse-account-id=<id> --platform-organization-id=<uuid>
 *   npx tsx scripts/assign-platform-mapping.ts event   --pulse-event-id=<id>   --platform-event-id=<uuid>
 *
 * Add --dry-run to resolve and report without writing.
 *
 * Both ids must be supplied explicitly. There is no lookup by email, name, slug, domain or
 * contact address, and no search mode: if you do not know the Pulse primary key, this tool
 * will not find it for you. An existing mapping is never re-pointed and identities are
 * never merged.
 *
 * Platform Core is read ONLY here, and only to prove that an event belongs to the
 * organization its Pulse account is mapped to. Pulse runtime never links against it.
 */
import { prisma } from '../lib/prisma'
import {
  assignPlatformEventMapping,
  assignPlatformOrganizationMapping,
  assignPlatformUserMapping,
  type PlatformEventLookup,
} from '../lib/platform/assign-mapping'

function flag(name: string): string | undefined {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`))
  return hit?.slice(name.length + 3).trim()
}

const dryRun = process.argv.includes('--dry-run')

function die(message: string): never {
  console.error(`\n  ✗ ${message}\n`)
  process.exit(1)
}

/** Reads one canonical event from Platform Core with the service-role key. */
const lookupPlatformEvent: PlatformEventLookup = async (platformEventId) => {
  const url = process.env.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL?.replace(/\/$/, '')
  const key = process.env.PLATFORM_CORE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  try {
    const response = await fetch(
      `${url}/rest/v1/events?id=eq.${encodeURIComponent(platformEventId)}&select=id,organization_id`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    )
    if (!response.ok) return null
    const rows = (await response.json()) as Array<{ id: string; organization_id: string }>
    return rows.length === 1 ? rows[0] : null
  } catch {
    return null
  }
}

async function main() {
  const command = process.argv[2]
  const label = dryRun ? 'DRY RUN' : 'WRITE'

  if (command === 'user') {
    const pulseUserId = flag('pulse-user-id')
    const platformUserId = flag('platform-user-id')
    if (!pulseUserId || !platformUserId) die('user requires --pulse-user-id=<id> and --platform-user-id=<uuid>')
    console.log(`\n[${label}] Pulse User ${pulseUserId}\n         platformUserId = ${platformUserId}`)
    const result = await assignPlatformUserMapping({ pulseUserId, platformUserId }, { dryRun })
    if (!result.ok) die(`${result.reason}${result.detail ? `: ${result.detail}` : ''}`)
    console.log(`  ✓ ${result.outcome}  ${JSON.stringify(result.value)}\n`)
    return
  }

  if (command === 'account') {
    const pulseAccountId = flag('pulse-account-id')
    const platformOrganizationId = flag('platform-organization-id')
    if (!pulseAccountId || !platformOrganizationId) die('account requires --pulse-account-id=<id> and --platform-organization-id=<uuid>')
    console.log(`\n[${label}] Pulse Account ${pulseAccountId}\n         platformOrganizationId = ${platformOrganizationId}`)
    const result = await assignPlatformOrganizationMapping({ pulseAccountId, platformOrganizationId }, { dryRun })
    if (!result.ok) die(`${result.reason}${result.detail ? `: ${result.detail}` : ''}`)
    console.log(`  ✓ ${result.outcome}  ${JSON.stringify(result.value)}\n`)
    return
  }

  if (command === 'event') {
    const pulseEventId = flag('pulse-event-id')
    const platformEventId = flag('platform-event-id')
    if (!pulseEventId || !platformEventId) die('event requires --pulse-event-id=<id> and --platform-event-id=<uuid>')
    console.log(`\n[${label}] Pulse Event ${pulseEventId}\n         platformEventId = ${platformEventId}`)
    const result = await assignPlatformEventMapping({ pulseEventId, platformEventId, lookupPlatformEvent }, { dryRun })
    if (!result.ok) die(`${result.reason}${result.detail ? `: ${result.detail}` : ''}`)
    console.log(`  ✓ ${result.outcome}  ${JSON.stringify(result.value)}\n`)
    return
  }

  die('usage: assign-platform-mapping.ts <user|account|event> --<pulse id> --<platform id> [--dry-run]')
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
