import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {},
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.googleusercontent.com" },
      { protocol: "https", hostname: "**.githubusercontent.com" },
    ],
  },
  async rewrites() {
    // Proxy REST calls to the NestJS API at runtime — no CORS, no build-time baking.
    // NEXT_PUBLIC_API_URL (or API_URL) is still needed for WebSocket connections.
    const apiBase =
      process.env.API_URL ??
      process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, "") ??
      "http://localhost:3001";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiBase}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
