import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  output: 'standalone',
  assetPrefix: '/legal12',
  async rewrites() {
    return [
      {
        source: '/legal12/:path*',
        destination: '/:path*',
      },
    ];
  },
  images: {
    unoptimized: true
  }
};

export default nextConfig;
