import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // repo root hi workspace root hai (parent lockfile warnings se bachne ke liye)
    root: process.cwd(),
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
