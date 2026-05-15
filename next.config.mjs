import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['playwright', 'pino', '@prisma/client', 'bullmq', 'ioredis'],
  outputFileTracingRoot: __dirname,
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config, { isServer }) => {
    config.externals = config.externals || [];
    if (isServer) {
      config.externals.push(
        { bullmq: 'commonjs bullmq' },
        { ioredis: 'commonjs ioredis' },
        { 'redis-parser': 'commonjs redis-parser' },
        { 'redis-errors': 'commonjs redis-errors' },
        {
          'playwright-core': 'commonjs playwright-core',
          // Treat Node built-ins as externals — fixes webpack handling of
          // both the `crypto`/`fs`/`path` and `node:*` import forms inside
          // the instrumentation + route-bundling contexts.
          crypto: 'commonjs crypto',
          fs: 'commonjs fs',
          path: 'commonjs path',
          'node:crypto': 'commonjs node:crypto',
          'node:fs': 'commonjs node:fs',
          'node:path': 'commonjs node:path',
        },
      );
    }
    // Suppress the harmless @anthropic-ai/sdk optional-dep warning since
    // our anthropic provider lazy-imports it and surfaces a friendly error.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /shared\/ai\/providers\/anthropic\.ts$/ },
    ];
    return config;
  },
};

export default nextConfig;
