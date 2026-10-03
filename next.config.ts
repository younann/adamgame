import type { NextConfig } from 'next';
import pkg from './package.json';

const APP_VERSION = `${pkg.version}+${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;

/**
 * The game is a fully client-side PWA, so we ship a static export.
 * `out/` is precached by the service worker (see scripts/build-sw.mjs) for offline play,
 * and Netlify serves it without any server runtime.
 */
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // let phones/tablets on the local network load the dev server
  allowedDevOrigins: ['10.0.0.*', '192.168.*.*'],
  turbopack: { root: __dirname },
  poweredByHeader: false,
  env: { NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION ?? APP_VERSION },
};

export default nextConfig;
