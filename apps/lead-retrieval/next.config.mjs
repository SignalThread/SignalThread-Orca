// Use .mjs because Next.js 14 does not support TypeScript config files (next.config.ts).
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Needed for large multipart uploads on routes that pass through middleware/proxy cloning.
    proxyClientMaxBodySize: "30mb"
  },
  async rewrites() {
    return [
      { source: "/app-access-ready", destination: "/exhibitor/app-access-ready" }
    ];
  }
};

export default nextConfig;
