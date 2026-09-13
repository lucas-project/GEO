import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.GEO_NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  serverExternalPackages: [
    'playwright',
    'playwright-extra',
    'puppeteer-extra-plugin',
    'puppeteer-extra-plugin-stealth',
    'clone-deep',
    'merge-deep',
    'lazy-cache',
    'pino',
    '@prisma/client',
    'bullmq',
    'ioredis',
  ],
  outputFileTracingRoot: __dirname,
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config, { isServer, nextRuntime }) => {
    config.watchOptions = { ...config.watchOptions, ignored: ['**/node_modules/**', '**/.git/**', '**/.next*/**', '**/prisma/*.db*', '**/data/**'] };
    if (nextRuntime === 'middleware') {
      config.output.globalObject = 'globalThis';
    }
    config.externals = config.externals || [];
    if (isServer) {
      config.externals.push(
        { bullmq: 'commonjs bullmq' },
        { ioredis: 'commonjs ioredis' },
        { 'redis-parser': 'commonjs redis-parser' },
        { 'redis-errors': 'commonjs redis-errors' },
        {
          'playwright-core': 'commonjs playwright-core',
          'playwright-extra': 'commonjs playwright-extra',
          'puppeteer-extra-plugin': 'commonjs puppeteer-extra-plugin',
          'puppeteer-extra-plugin-stealth': 'commonjs puppeteer-extra-plugin-stealth',
          'clone-deep': 'commonjs clone-deep',
          'merge-deep': 'commonjs merge-deep',
          'lazy-cache': 'commonjs lazy-cache',
          // Treat Node built-ins as externals — fixes webpack handling of
          // both the `crypto`/`fs`/`path` and `node:*` import forms inside
          // the instrumentation + route-bundling contexts.
          crypto: 'commonjs crypto',
          fs: 'commonjs fs',
          path: 'commonjs path',
          'node:crypto': 'commonjs node:crypto',
          'node:fs': 'commonjs node:fs',
          'node:path': 'commonjs node:path',
          child_process: 'commonjs child_process',
          'node:child_process': 'commonjs node:child_process',
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
