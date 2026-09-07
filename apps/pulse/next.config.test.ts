import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextConfig = require('./next.config.js')

// npm workspaces may hoist these packages to the repository root, so the traced
// paths are resolved from the installed package rather than ./node_modules.
const pdfkitDir = path.dirname(require.resolve('pdfkit/package.json'))
const montserratDir = path.dirname(require.resolve('@fontsource/montserrat/package.json'))
const relativeToProject = (absolute: string) => {
  const relative = path.relative(process.cwd(), absolute).split(path.sep).join('/')
  return relative.startsWith('..') ? relative : './' + relative
}

describe('Next server packaging', () => {
  it('keeps PDFKit external so its runtime AFM metrics resolve from the package', () => {
    expect(nextConfig.experimental.serverComponentsExternalPackages).toContain('pdfkit')
    expect(fs.existsSync(path.join(pdfkitDir, 'js/data/Helvetica.afm'))).toBe(true)
  })

  it('traces the PDFKit metrics and embedded brief fonts for the PDF route', () => {
    expect(nextConfig.experimental.outputFileTracingIncludes).toMatchObject({
      '/api/app/events/**/brief': expect.arrayContaining([
        relativeToProject(path.join(pdfkitDir, 'js/data/**/*')),
        relativeToProject(path.join(montserratDir, 'files/montserrat-latin-400-normal.woff')),
        relativeToProject(path.join(montserratDir, 'files/montserrat-latin-600-normal.woff')),
        relativeToProject(path.join(montserratDir, 'files/montserrat-latin-700-normal.woff')),
      ]),
    })
  })
})
