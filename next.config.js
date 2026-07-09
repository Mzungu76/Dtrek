const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      // Wikipedia/Wikimedia thumbnails (POI cards, guide photos)
      { protocol: 'https', hostname: '**.wikimedia.org' },
      { protocol: 'https', hostname: '**.wikipedia.org' },
      // User-uploaded route/activity photos
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
  experimental: {
    // Per-module tree-shaking for icon/chart libraries imported broadly across the app
    // (lucide-react in ~90 files, recharts in the stats tabs) instead of relying on the
    // bundler to infer it from named ESM imports alone.
    optimizePackageImports: ['lucide-react', 'recharts'],
  },
}

module.exports = withBundleAnalyzer(nextConfig)
