import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'app/login/page.tsx'), 'utf8')

describe('login return path', () => {
  it('returns assignment email deep links to a safe internal app path after session or OTP login', () => {
    expect(source).toContain("requestedNext?.startsWith('/app/')")
    expect(source).toContain("!requestedNext.startsWith('//')")
    expect(source.match(/router\.push\(safeNext \|\|/g)).toHaveLength(2)
  })
})
