import { createServer } from 'node:net'
import { appendFileSync, createWriteStream, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const args = new Set(process.argv.slice(2))
const quiet = args.has('--quiet')
const realDbOnly = args.has('--real-db')
const realBrowserOnly = args.has('--real-browser')
const focusedRealRun = realDbOnly || realBrowserOnly
const logDirectory = join(root, '.preprod-results')
const logPath = join(logDirectory, 'preprod.log')

mkdirSync(logDirectory, { recursive: true })
if (quiet) appendFileSync(logPath, `\n\n=== pre-production run ${new Date().toISOString()} ===\n`)

const baseEnv = { ...process.env }

function commandLabel(command, commandArgs) {
  return [command, ...commandArgs].join(' ')
}

async function run(command, commandArgs, options = {}) {
  const label = options.label ?? commandLabel(command, commandArgs)
  if (!quiet) process.stdout.write(`\n▶ ${label}\n`)
  else appendFileSync(logPath, `\n▶ ${label}\n`)

  const child = spawn(command, commandArgs, {
    cwd: root,
    env: { ...baseEnv, ...options.env },
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  })

  let logStream
  if (quiet) {
    logStream = createWriteStream(logPath, { flags: 'a' })
    child.stdout.pipe(logStream, { end: false })
    child.stderr.pipe(logStream, { end: false })
  }

  const result = await new Promise((resolveResult, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolveResult({ code, signal }))
  })
  if (logStream) await new Promise((resolveStream) => logStream.end(resolveStream))
  if (result.code !== 0) throw new Error(`${label} failed${result.signal ? ` with signal ${result.signal}` : ` with exit code ${result.code}`}`)
}

function postgresBin(name) {
  const configured = process.env.POSTGRES_BIN_DIR
  if (configured) return join(configured, name)
  const result = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' })
  const binDir = result.status === 0 ? result.stdout.trim() : ''
  return binDir ? join(binDir, name) : name
}

async function availablePort() {
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : null
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()))
  if (!port) throw new Error('Unable to reserve a local Postgres port')
  return port
}

function configuredCiDatabase() {
  if (!process.env.CI || !process.env.DATABASE_URL) return null
  const url = new URL(process.env.DATABASE_URL)
  const databaseName = url.pathname.replace(/^\//, '')
  if (url.port === '6543') throw new Error('Real Events tests refuse transaction-pooler port 6543; use a direct Postgres URL.')
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !databaseName.includes('test')) {
    throw new Error('CI real Events tests require a localhost database whose name contains "test".')
  }
  return process.env.DATABASE_URL
}

async function withTestDatabase(callback) {
  const configuredUrl = configuredCiDatabase()
  if (configuredUrl) {
    return callback({
      DATABASE_URL: configuredUrl,
      DIRECT_URL: process.env.DIRECT_URL || configuredUrl,
      REAL_DATABASE_TESTS: '1',
    })
  }

  const directory = mkdtempSync(join(tmpdir(), 'booth-audio-preprod-postgres-'))
  const dataDirectory = join(directory, 'data')
  const port = await availablePort()
  const databaseName = 'voice_events_test'
  let started = false

  try {
    await run(postgresBin('initdb'), ['-D', dataDirectory, '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8'], { label: 'Initialize isolated Postgres' })
    await run(postgresBin('pg_ctl'), ['-D', dataDirectory, '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start'], { label: 'Start isolated Postgres' })
    started = true
    await run(postgresBin('createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', databaseName], { label: 'Create isolated Events test database' })
    const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/${databaseName}?schema=public`
    await callback({ DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl, REAL_DATABASE_TESTS: '1' })
  } finally {
    if (started) {
      try {
        await run(postgresBin('pg_ctl'), ['-D', dataDirectory, '-m', 'fast', '-w', 'stop'], { label: 'Stop isolated Postgres' })
      } catch (error) {
        if (quiet) appendFileSync(logPath, `\nPostgres shutdown warning: ${error.message}\n`)
        else process.stderr.write(`Postgres shutdown warning: ${error.message}\n`)
      }
    }
    rmSync(directory, { recursive: true, force: true })
  }
}

async function prepareDatabase(env) {
  await run('npx', ['prisma', 'migrate', 'deploy'], { env, label: 'Apply committed migrations to empty Postgres' })
  await run('npx', ['prisma', 'migrate', 'diff', '--exit-code', '--from-url', env.DATABASE_URL, '--to-schema-datamodel', 'prisma/schema.prisma'], { env, label: 'Verify migration history matches schema.prisma' })
}

async function runRealDatabase(env) {
  await run('npx', ['vitest', 'run', 'tests/integration/events-critical-real-db.test.ts'], { env, label: 'Real Postgres integration journeys (8)' })
  await run('npx', ['vitest', 'run', 'tests/integration/data-api-lockdown-real-db.test.ts'], { env, label: 'Data API lockdown: RLS on, API roles revoked, owner unaffected' })
  await run('npx', ['vitest', 'run', 'tests/integration/platform-identity-mapping-real-db.test.ts'], { env, label: 'Platform identity mapping: nullable, unique where intended, no local id change' })
}

async function runRealBrowser(env) {
  await run('npx', ['playwright', 'test', '--config=playwright.real.config.ts'], { env, label: 'Real app/API/Postgres browser journeys (8)' })
}

async function main() {
  if (!focusedRealRun) {
    await run('npx', ['prisma', 'validate'], { label: 'Validate Prisma schema' })
    await run('npx', ['prisma', 'generate'], { label: 'Generate Prisma client' })
    await run('npm', ['run', 'typecheck'], { label: 'Typecheck' })
    await run('npm', ['test'], { label: 'Unit and integration suite' })
    await run('npm', ['run', 'test:events:mocked-browser'], { label: 'Mocked Events browser journeys (52)' })
  }

  await withTestDatabase(async (env) => {
    await prepareDatabase(env)
    if (!realBrowserOnly) await runRealDatabase(env)
    if (!realDbOnly) await runRealBrowser(env)
  })

  if (quiet && !focusedRealRun) {
    process.stdout.write('✅ PRE-PROD TEST SUITE PASSED\n')
  } else if (!quiet) {
    process.stdout.write('\n✓ Requested pre-production gates passed.\n')
  }
}

main().catch((error) => {
  if (quiet) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}. Detailed log: ${logPath}\n`)
    process.stderr.write('❌ PRE-PROD TEST SUITE FAILED\n')
  } else {
    process.stderr.write(`FAIL: ${error instanceof Error ? error.message : String(error)}.\n`)
  }
  process.exitCode = 1
})
