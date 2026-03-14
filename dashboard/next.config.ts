import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
