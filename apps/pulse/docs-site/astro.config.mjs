import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  site: 'https://signalthread.ai',
  base: '/help',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'SignalThread Help',
      description: 'Customer help for SignalThread voice surveys and kiosk feedback.',
      customCss: ['./src/styles/custom.css'],
      social: [],
      sidebar: [
        {
          label: 'Overview',
          items: [
            { label: 'Help Home', link: '/' },
            { slug: 'getting-started' },
          ],
        },
        {
          label: 'Surveys',
          items: [{ autogenerate: { directory: 'surveys' } }],
        },
        {
          label: 'Workspace',
          items: [{ autogenerate: { directory: 'workspace' } }],
        },
        {
          label: 'Support',
          items: [{ autogenerate: { directory: 'support' } }],
        },
      ],
    }),
  ],
})
