import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  output: 'standalone',
  basePath: '/legal12',
  images: {
    unoptimized: true
  }
};

export default nextConfig;
