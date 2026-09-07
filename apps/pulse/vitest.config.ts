import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    server: {
      deps: {
        // These React-consuming packages are hoisted to the repository root by
        // npm workspaces and would otherwise be loaded natively against the
        // root's React copy. Inlining them lets `resolve.dedupe` apply.
        inline: ['qrcode.react', '@hello-pangea/dnd'],
      },
    },
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      'e2e/**',
      'e2e-real/**',
      'docs-site/**',
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
    // npm workspaces hoist some React-consuming packages (for example
    // qrcode.react) to the repository root, where they would resolve the
    // root's newer React copy. Next aliases React itself at build time; for
    // tests, force every import to this app's own React so hooks share one
    // renderer instance.
    dedupe: ['react', 'react-dom'],
  },
})
