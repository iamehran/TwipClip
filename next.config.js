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
  webpack: (config, { isServer }) => {
    // Resolve issues with next-connect
    config.resolve.fallback = { ...config.resolve.fallback, net: false };
    
    // Ensure job-manager functions are not mangled in production
    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        // Keep function names in production for critical modules
        keepFnames: true,
        // Prevent aggressive minification of specific modules
        minimizer: config.optimization.minimizer?.map((minimizer) => {
          if (minimizer.constructor.name === 'TerserPlugin') {
            minimizer.options.terserOptions = {
              ...minimizer.options.terserOptions,
              keep_fnames: /updateProcessingStatus|createProcessingJob/,
              mangle: {
                ...minimizer.options.terserOptions?.mangle,
                reserved: ['updateProcessingStatus', 'createProcessingJob', 'jobs'],
              },
            };
          }
          return minimizer;
        }),
      };
    }
    
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
  // Experimental features that might help with function reference issues
  experimental: {
    // Ensure server components work correctly
    serverComponentsExternalPackages: ['job-manager'],
  },
};

module.exports = nextConfig; 