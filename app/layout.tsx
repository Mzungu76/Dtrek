import type { Metadata, Viewport } from 'next'
import './globals.css'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'
import InstallPWA from '@/components/InstallPWA'
import OfflineBanner from '@/components/OfflineBanner'
import OfflineSync from '@/components/OfflineSync'

export const metadata: Metadata = {
  title: 'Diario Trekking',
  description: 'Il tuo diario personale di escursioni e trekking',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'DTrek',
  },
  icons: {
    icon: [
      { url: '/favicon.ico',   sizes: '16x16 32x32'    },
      { url: '/icon-192.png',  sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png',  sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  other: {
    'mobile-web-app-capable':  'yes',
    'msapplication-TileColor': '#277134',
    'msapplication-TileImage': '/icon-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#277134' },
    { media: '(prefers-color-scheme: dark)',  color: '#193b20' },
  ],
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="antialiased">
        {children}
        <OfflineBanner />
        <ServiceWorkerRegister />
        <InstallPWA />
        <OfflineSync />
      </body>
    </html>
  )
}
