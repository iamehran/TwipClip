/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  env: {
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
    NEXT_PUBLIC_YOUTUBE_API_KEY: process.env.NEXT_PUBLIC_YOUTUBE_API_KEY,
  },
  publicRuntimeConfig: {
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
    NEXT_PUBLIC_YOUTUBE_API_KEY: process.env.NEXT_PUBLIC_YOUTUBE_API_KEY,
  },
  serverRuntimeConfig: {
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
  },
  images: {
    domains: ['i.ytimg.com', 'img.youtube.com'],
  },
  webpack: (config) => {
    // Resolve issues with next-connect
    config.resolve.fallback = { ...config.resolve.fallback, net: false };
    
    return config;
  },
};

module.exports = nextConfig; 