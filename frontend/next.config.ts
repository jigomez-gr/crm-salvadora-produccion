import type { NextConfig } from "next";

const backendUrl =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? "http://ccmfallaviajeasevilla-salvadora-toiagj:3001" : "http://127.0.0.1:3001");

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: "/healthz/:path*",
        destination: `${backendUrl}/healthz/:path*`,
      },
      {
        source: "/healthz",
        destination: `${backendUrl}/healthz`,
      },
    ];
  },
};

export default nextConfig;
