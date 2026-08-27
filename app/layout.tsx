import type { Metadata, Viewport } from 'next'
import { Playfair_Display, DM_Sans, JetBrains_Mono, Barlow_Condensed, Lora, Kalam } from 'next/font/google'
import './globals.css'
import AppChrome from '@/components/AppChrome'

// Self-hosted via next/font (build-time download + inline @font-face), replacing the old
// render-blocking `@import url(fonts.googleapis.com/...)` in globals.css — that import forced
// every page load through two extra cross-origin round trips (googleapis.com for the CSS, then
// gstatic.com for the font files) before text could render. next/font eliminates both.
const playfairDisplay = Playfair_Display({
  subsets: ['latin'], style: ['normal', 'italic'], weight: ['400', '600', '700'],
  variable: '--font-display', display: 'swap',
})
const dmSans = DM_Sans({
  subsets: ['latin'], style: ['normal', 'italic'], weight: ['300', '400', '500'],
  variable: '--font-body', display: 'swap',
})
const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'], weight: ['400', '500'],
  variable: '--font-mono', display: 'swap',
})
const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'], weight: ['400', '600', '700', '900'],
  variable: '--font-barlow', display: 'swap',
})
const lora = Lora({
  subsets: ['latin'], style: ['normal', 'italic'], weight: ['400', '600'],
  variable: '--font-lora', display: 'swap',
})
// Direzione "taccuino topografico" (docs/diario-a-libro-piano.md, Fase 17 — variante approvata,
// integrazione graduale) — annotazioni e titoli scritti a mano, vedi lib/taccuinoTokens.tsx.
const kalam = Kalam({
  subsets: ['latin'], weight: ['400', '700'],
  variable: '--font-kalam', display: 'swap',
})

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
    <html lang="it" className={`${playfairDisplay.variable} ${dmSans.variable} ${jetBrainsMono.variable} ${barlowCondensed.variable} ${lora.variable} ${kalam.variable}`}>
      <body className="antialiased">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  )
}
