'use client'
import { useEffect, useState } from 'react'
import { WifiOff, RefreshCw } from 'lucide-react'

export default function OfflineBanner() {
  const [offline, setOffline] = useState(false)
  const [justCameOnline, setJustCameOnline] = useState(false)

  useEffect(() => {
    setOffline(!navigator.onLine)

    const goOffline = () => {
      setOffline(true)
      setJustCameOnline(false)
    }
    const goOnline = () => {
      setOffline(false)
      setJustCameOnline(true)
      setTimeout(() => setJustCameOnline(false), 3000)
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online',  goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online',  goOnline)
    }
  }, [])

  if (!offline && !justCameOnline) return null

  return (
    <div
      className={`fixed top-14 inset-x-0 z-40 flex items-center justify-center gap-2 py-1.5 text-xs font-medium text-white transition-all duration-500 ${
        offline ? 'bg-amber-600' : 'bg-forest-600'
      }`}
    >
      {offline ? (
        <>
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Modalità offline · Stai visualizzando i dati in cache</span>
        </>
      ) : (
        <>
          <RefreshCw className="w-3.5 h-3.5 shrink-0" />
          <span>Connessione ripristinata · Dati in aggiornamento…</span>
        </>
      )}
    </div>
  )
}
