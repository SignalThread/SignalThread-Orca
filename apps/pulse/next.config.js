const path = require('node:path')

// npm workspaces hoist dependencies to the repository root, so a package this
// app depends on may live in <repo>/node_modules rather than ./node_modules.
// Resolve the installed location instead of assuming a local install; the
// result is relative to this directory because Next globs tracing includes
// from the project root.
function tracedPackagePath(packageName, ...segments) {
  const packageDir = path.dirname(require.resolve(`${packageName}/package.json`))
  const relative = path.join(path.relative(__dirname, packageDir), ...segments).split(path.sep).join('/')
  return relative.startsWith('..') ? relative : './' + relative
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Playwright suites set an isolated dist directory so their self-managed
  // servers never race a developer server over the same .next artifacts.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // PDFKit loads its built-in AFM font metrics relative to its installed
    // package at runtime. Bundling it into a Next server chunk rewrites that
    // directory and makes PDFDocument fail before our document renderer runs.
    serverComponentsExternalPackages: ['pdfkit'],
    // Keep PDFKit's runtime metrics and the fonts embedded by the brief export
    // in traced server output (for example Vercel/standalone deployments).
    outputFileTracingIncludes: {
      '/api/app/events/**/brief': [
        tracedPackagePath('pdfkit', 'js/data/**/*'),
        tracedPackagePath('@fontsource/montserrat', 'files/montserrat-latin-400-normal.woff'),
        tracedPackagePath('@fontsource/montserrat', 'files/montserrat-latin-600-normal.woff'),
        tracedPackagePath('@fontsource/montserrat', 'files/montserrat-latin-700-normal.woff'),
      ],
    },
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/help/getting-started/:path*',
          destination: '/help/getting-started/index.html',
        },
        {
          source: '/help/surveys/:slug/:path*',
          destination: '/help/surveys/:slug/index.html',
        },
        {
          source: '/help/workspace/:slug/:path*',
          destination: '/help/workspace/:slug/index.html',
        },
        {
          source: '/help/support/:slug/:path*',
          destination: '/help/support/:slug/index.html',
        },
      ],
    }
  },
}

module.exports = nextConfig
