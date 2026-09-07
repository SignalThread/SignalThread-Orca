import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parse as parseDotenv } from 'dotenv'
import type { CollectionPhase, ResponseStatus } from '@prisma/client'

export const SOURCE_EVENT_ID = 'event_advanced_demo_20260902031540_6c81e383'
export const SOURCE_EVENT_NAME = 'SignalThread Live Experience Summit'
export const SOURCE_ACCOUNT_SLUG = 'events-demo'
export const TARGET_ACCOUNT_NAME = 'SignalThread'
export const EXPECTED_SOURCE_PROJECT = 'xcveazzoavnizefbcjfg'
export const EXPECTED_TARGET_PROJECT = 'tsoquobpingfqezolvgp'

export type CloneOptions = {
  apply: boolean
  sourceEnvPath: string
  targetEnvPath: string
  confirmTargetProject: string | null
}

function singleValue(argv: string[], name: string): string | null {
  const prefix = `--${name}=`
  const matches = argv.filter((arg) => arg.startsWith(prefix))
  if (matches.length > 1) throw new Error(`Provide --${name} at most once`)
  if (argv.includes(`--${name}`)) throw new Error(`Use --${name}=<value>`)
  const value = matches[0]?.slice(prefix.length).trim() ?? null
  if (matches.length && !value) throw new Error(`--${name} requires a non-empty value`)
  return value
}

export function parseCloneOptions(argv: string[] = process.argv.slice(2)): CloneOptions {
  const allowed = new Set(['--apply'])
  for (const arg of argv) {
    if (
      !allowed.has(arg) &&
      !arg.startsWith('--source-env=') &&
      !arg.startsWith('--target-env=') &&
      !arg.startsWith('--confirm-target-project=')
    ) {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  const sourceEnvPath = singleValue(argv, 'source-env')
  const targetEnvPath = singleValue(argv, 'target-env')
  const confirmTargetProject = singleValue(argv, 'confirm-target-project')
  if (!sourceEnvPath) throw new Error('Explicit --source-env=<path> is required')
  if (!targetEnvPath) throw new Error('Explicit --target-env=<path> is required')
  if (resolve(sourceEnvPath) === resolve(targetEnvPath)) {
    throw new Error('Source and target env files must be different')
  }

  const apply = argv.includes('--apply')
  if (apply && confirmTargetProject !== EXPECTED_TARGET_PROJECT) {
    throw new Error(
      `--apply also requires --confirm-target-project=${EXPECTED_TARGET_PROJECT}`,
    )
  }
  if (!apply && confirmTargetProject) {
    throw new Error('--confirm-target-project is only valid together with --apply')
  }

  return { apply, sourceEnvPath, targetEnvPath, confirmTargetProject }
}

export function loadDatabaseUrl(envPath: string): string {
  const values = parseDotenv(readFileSync(resolve(envPath)))
  const url = values.DIRECT_URL || values.DATABASE_URL
  if (!url) throw new Error(`${envPath} must define DIRECT_URL or DATABASE_URL`)
  return url
}

export function projectRefFromDatabaseUrl(databaseUrl: string): string {
  const parsed = new URL(databaseUrl)
  const username = decodeURIComponent(parsed.username)
  const candidates = `${parsed.hostname}.${username}`.match(/[a-z]{20}/g) ?? []
  const unique = [...new Set(candidates)]
  if (unique.length !== 1) {
    throw new Error('Could not positively resolve exactly one Supabase project ref from the database URL')
  }
  return unique[0]
}

export function describeDatabaseUrl(databaseUrl: string) {
  const parsed = new URL(databaseUrl)
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    database: parsed.pathname.replace(/^\//, ''),
    username: decodeURIComponent(parsed.username),
    projectRef: projectRefFromDatabaseUrl(databaseUrl),
  }
}

export function deterministicCloneId(
  entity: string,
  sourceId: string,
  targetProject = EXPECTED_TARGET_PROJECT,
): string {
  const prefix = entity.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 18)
  const digest = createHash('sha256')
    .update(`signalthread-event-clone-v1:${targetProject}:${SOURCE_EVENT_ID}:${entity}:${sourceId}`)
    .digest('hex')
    .slice(0, 26)
  return `cln_${prefix}_${digest}`
}

export function deterministicValue(namespace: string, sourceValue: string): string {
  return deterministicCloneId(namespace, sourceValue)
}

export function rewriteJsonIds(
  value: unknown,
  idMap: ReadonlyMap<string, string>,
): unknown {
  if (typeof value === 'string') return idMap.get(value) ?? value
  if (Array.isArray(value)) return value.map((item) => rewriteJsonIds(item, idMap))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rewriteJsonIds(item, idMap)]),
    )
  }
  return value
}

export type PhaseCountRow = {
  collectionPhase: CollectionPhase | null
  status: ResponseStatus
}

export function lifecycleResponseCounts(rows: PhaseCountRow[]) {
  const completed = rows.filter((row) => row.status === 'COMPLETED')
  const pre = completed.filter((row) => row.collectionPhase === 'PRE').length
  const during = completed.filter((row) => row.collectionPhase === 'DURING').length
  const postOnly = completed.filter((row) => row.collectionPhase === 'POST').length
  return {
    pre,
    during,
    postOnly,
    postDashboard: during + postOnly,
    nullPhase: rows.filter((row) => row.collectionPhase === null).length,
    total: rows.length,
  }
}

export function assertExactSet(label: string, actual: Iterable<string>, expected: Set<string>) {
  for (const value of actual) {
    if (!expected.has(value)) throw new Error(`${label} contains out-of-scope reference: ${value}`)
  }
}

export function assertNoSourceIds(
  label: string,
  values: Iterable<string | null | undefined>,
  sourceIds: Set<string>,
) {
  for (const value of values) {
    if (value && sourceIds.has(value)) {
      throw new Error(`${label} retained a source-environment ID: ${value}`)
    }
  }
}
