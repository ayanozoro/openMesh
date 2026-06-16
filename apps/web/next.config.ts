import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@openmesh/shared", "@openmesh/sdk", "@openmesh/networking", "@openmesh/transfer", "@openmesh/encryption"],
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
