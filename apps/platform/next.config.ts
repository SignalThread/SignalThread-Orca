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
  transpilePackages: ["@signalthread/ui"],
  turbopack: {
    // The workspace root, where npm hoists dependencies. This app sits at
    // <repo>/apps/platform, so the root is two levels up. Climbing a single level
    // would resolve to apps/, which has no node_modules, and Turbopack fails with
    // "Could not find the Next.js package".
    root: path.join(__dirname, "..", ".."),
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS.map((header) => ({ ...header })) }];
  },
};

export default nextConfig;
