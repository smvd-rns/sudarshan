import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
      },
    ],
    unoptimized: true, // Bypass Vercel image optimization to stay within free plan limits
  },
  async rewrites() {
    return {
      fallback: [
        {
          source: '/_next/:path*',
          destination: 'https://radheshyamdas.com/_next/:path*',
        },
      ],
    };
  },
};

export default nextConfig;
