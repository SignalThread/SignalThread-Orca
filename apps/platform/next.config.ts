import path from "node:path";
import type { NextConfig } from "next";

// Mirrors Orca's baseline hardening so both apps present the same transport and
// framing posture. Kept in each app rather than shared: deployment boundaries are
// per-app, and a shared config would couple two independently deployed projects.
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
] as const;

const nextConfig: NextConfig = {
  // Development only. Lets the dev server serve assets when the app is reached
  // through a hostname other than localhost, which is required to exercise the
  // production-like cross-subdomain flow locally (platform.localtest.me /
  // orca.localtest.me both resolve to 127.0.0.1). Has no effect on a production
  // build, where assets are served from the deployment's own origin.
  allowedDevOrigins: ["platform.localtest.me", "orca.localtest.me"],
  transpilePackages: ["@signalthread/ui"],
  turbopack: {
    // The workspace root, where npm hoists dependencies. This app sits at
    // <repo>/apps/platform, so the root is two levels up. Climbing a single level
    // would resolve to apps/, which has no node_modules, and Turbopack fails with
    // "Could not find the Next.js package".
    root: path.join(__dirname, "..", ".."),
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS.map((header) => ({ ...header })) },
      {
        // The launch endpoint redirects with a one-time handoff token in the query
        // string. The global `strict-origin-when-cross-origin` would still send the
        // origin; `no-referrer` sends nothing at all. Declared here because config
        // headers are applied after route handlers and would otherwise win.
        source: "/api/launch/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
