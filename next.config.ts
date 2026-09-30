// Modified from Kev (https://github.com/jaredpalmer/kev), Copyright 2026 Jared Palmer, Apache-2.0.
// Changes for the D1A playground by John Soliva, 2026.
import type { NextConfig } from "next";

// FastAPI (kev.serve) is proxied under /kev so the browser never deals with CORS or ports.
const KEV_API = process.env.KEV_API ?? "http://127.0.0.1:8009";
// Optional sub-path, e.g. D1A_BASE_PATH=/d1a behind a reverse proxy. Set it for both `next build` (the client bundle
// inlines it) and `next start` (which reads this file again).
const basePath = process.env.D1A_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  reactCompiler: true,
  devIndicators: false,
  // Next dev only trusts the hostname it was started with (localhost); without this,
  // opening the app via 127.0.0.1 renders the SSR HTML but never hydrates (no errors, buttons dead).
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    // With a basePath, Next prefixes the source (/d1a/kev/...) and leaves the external destination alone.
    return [{ source: "/kev/:path*", destination: `${KEV_API}/:path*` }];
  },
};

export default nextConfig;
