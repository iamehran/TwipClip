/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  env: {
    USE_RAPIDAPI: process.env.USE_RAPIDAPI,
    RAPIDAPI_KEY: process.env.RAPIDAPI_KEY,
    RAPIDAPI_HOST: process.env.RAPIDAPI_HOST,
  },
  publicRuntimeConfig: {
    USE_RAPIDAPI: process.env.USE_RAPIDAPI,
  },
  serverRuntimeConfig: {
    RAPIDAPI_KEY: process.env.RAPIDAPI_KEY,
    RAPIDAPI_HOST: process.env.RAPIDAPI_HOST,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
        pathname: '/**',
      },
    ],
  },
  webpack: (config) => {
    // Resolve issues with next-connect
    config.resolve.fallback = { ...config.resolve.fallback, net: false };
    
    return config;
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig; 