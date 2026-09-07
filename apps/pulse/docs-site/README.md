# SignalThread Help Docs Site

This is a separate Astro Starlight app for publishing customer-facing help docs under `/help`.

## Local development

```bash
cd docs-site
npm install
npm run dev
```

## Production build

```bash
cd docs-site
npm run build
```

## Single-project deployment inside the Voice app

The main Voice app build copies the generated Astro output into `public/help/`.

How it works:

1. `docs-site` builds as static Astro output
2. the root build script copies `docs-site/dist` to `public/help/`
3. `public/help/index.html` is deleted so Next keeps owning `/help`
4. nested docs routes like `/help/surveys/creating-a-survey` are served from generated static files under `public/help/`

To generate the static help output locally:

```bash
cd /Users/ali/Documents/Booth\ Audio
npm run build:help-docs
```

Then start the main app:

```bash
npm run dev
```

This gives you:

- Next landing page at `/help`
- generated static docs at `/help/*`

## Production deployment

Use the existing single Voice app deployment.

The root build already runs:

```bash
npm run build:help-docs
```

before `next build`, so the generated docs are included in the main deployment artifact.

No second Vercel project and no external proxy are required for this setup.
