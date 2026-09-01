import type { NextConfig } from "next";

const backendUrl =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? "http://172.17.0.1:3001" : "http://127.0.0.1:3001");

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
