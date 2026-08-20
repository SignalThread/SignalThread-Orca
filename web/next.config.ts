import path from "node:path";
import type { NextConfig } from "next";

// Baseline security headers applied to every response. These are static and
// framework-compatible: they harden transport, framing, MIME-sniffing, referrer
// leakage, and unused browser features without touching app behavior. A
// Content-Security-Policy is intentionally NOT set here — a strict CSP needs a
// nonce/report-only rollout to avoid breaking Next.js inline scripts/styles, so
// it is tracked as a separate follow-up.
const SECURITY_HEADERS = [
  // Force HTTPS for two years including subdomains. Ignored by browsers over
  // plain http (local dev), enforced in production.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Allow same-origin framing (previews) but block cross-origin clickjacking.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable powerful features the app does not use.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
] as const;

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas"],
  transpilePackages: ["@signalthread/ui"],
  turbopack: {
    root: path.join(__dirname, ".."),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS.map((header) => ({ ...header })),
      },
    ];
  },
};

export default nextConfig;
