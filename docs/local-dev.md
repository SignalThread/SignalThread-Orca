# Local Development

Planner OS now serves the web UI and API from a single Next.js app.

## Start

```bash
cd /Users/ali/Documents/planner-os/web
npm run dev -- -p 3000
```

## Notes

- Use same-origin API routes from the Next app (`/api/...`).
- Legacy Express API runtime has been removed. Use the Next.js route handlers in `web/app/api/**` only.
