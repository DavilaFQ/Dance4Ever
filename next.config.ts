import type { NextConfig } from "next";

const nextConfig: any = {
  allowedDevOrigins: ['192.168.1.15', '192.168.1.67', '192.168.1.69', '192.168.100.130'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
