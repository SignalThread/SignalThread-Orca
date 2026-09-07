import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const docsSiteDir = path.join(repoRoot, 'docs-site')
const docsDistDir = path.join(docsSiteDir, 'dist')
const publicHelpDir = path.join(repoRoot, 'public', 'help')

function ensureDirExists(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Directory not found: ${dir}`)
  }
}

console.log('[help-docs] Preparing Astro docs-site...')
ensureDirExists(docsSiteDir)
ensureDirExists(path.join(docsSiteDir, 'package-lock.json'))
console.log('[help-docs] Installing docs-site dependencies...')
execSync('npm ci', {
  cwd: docsSiteDir,
  stdio: 'inherit',
})
console.log('[help-docs] Building Astro docs-site...')
execSync('npm run build', {
  cwd: docsSiteDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    ASTRO_TELEMETRY_DISABLED: '1',
  },
})

console.log('[help-docs] Syncing docs-site/dist to public/help...')
ensureDirExists(docsDistDir)
fs.rmSync(publicHelpDir, { recursive: true, force: true })
fs.mkdirSync(publicHelpDir, { recursive: true })
fs.cpSync(docsDistDir, publicHelpDir, { recursive: true })

const rootHelpIndex = path.join(publicHelpDir, 'index.html')
if (fs.existsSync(rootHelpIndex)) {
  fs.rmSync(rootHelpIndex)
  console.log('[help-docs] Removed public/help/index.html so Next keeps owning /help')
}

console.log('[help-docs] Help docs available under public/help/')
