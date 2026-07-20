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
  // Without an explicit header, /sw.js gets whatever default caching Vercel/the browser applies
  // to a plain static file under public/ — long enough in practice that a device can keep running
  // an old service worker for hours, silently serving stale cached API responses (network-first
  // inside the SW doesn't help if the SW *itself* never gets re-fetched to pick up that logic in
  // the first place). A real user hit exactly this: a newly-saved hike didn't appear anywhere
  // until they manually unregistered the service worker — no amount of hard-reloading the page
  // fixed it, because a hard reload forces a fresh page/JS fetch but does NOT force the browser to
  // re-fetch and re-activate the service worker script controlling that page's own API calls.
  // no-cache (not no-store) still lets the browser keep a copy, but forces a conditional
  // revalidation request every time — cheap (304 on no change) and exactly what a file whose
  // job is "notice when I've changed" needs.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
        ],
      },
    ]
  },
}

module.exports = withBundleAnalyzer(nextConfig)
