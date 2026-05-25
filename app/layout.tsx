import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Diario Trekking',
  description: 'Il tuo diario personale di escursioni e trekking',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="antialiased">{children}</body>
    </html>
  )
}
