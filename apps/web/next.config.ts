import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@openmesh/shared"],
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
