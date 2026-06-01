'use client'
import { useEffect, useState } from 'react'
import { Download, X, Share, ArrowDownToLine } from 'lucide-react'

type Platform = 'android' | 'ios' | 'desktop' | null

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [platform, setPlatform]             = useState<Platform>(null)
  const [showBanner, setShowBanner]         = useState(false)
  const [showIOSGuide, setShowIOSGuide]     = useState(false)
  const [installed, setInstalled]           = useState(false)

  useEffect(() => {
    // Already installed as PWA?
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }
    if ((window.navigator as any).standalone === true) {
      setInstalled(true)
      return
    }

    // Detect platform
    const ua = navigator.userAgent.toLowerCase()
    const isIOS = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream
    const isAndroid = /android/.test(ua)

    if (isIOS)          setPlatform('ios')
    else if (isAndroid) setPlatform('android')
    else                setPlatform('desktop')

    // For iOS, show banner after a short delay (no beforeinstallprompt on Safari)
    if (isIOS) {
      const dismissed = sessionStorage.getItem('pwa-banner-dismissed')
      if (!dismissed) setTimeout(() => setShowBanner(true), 2500)
      return
    }

    // For Android/Desktop: capture beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      const dismissed = sessionStorage.getItem('pwa-banner-dismissed')
      if (!dismissed) setShowBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)

    window.addEventListener('appinstalled', () => {
      setInstalled(true)
      setShowBanner(false)
      setDeferredPrompt(null)
    })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (platform === 'ios') {
      setShowIOSGuide(true)
      return
    }
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setShowBanner(false)
    setDeferredPrompt(null)
  }

  const dismiss = () => {
    setShowBanner(false)
    sessionStorage.setItem('pwa-banner-dismissed', '1')
  }

  if (installed || (!showBanner && !deferredPrompt)) return null

  return (
    <>
      {/* ── Install banner ────────────────────────────────────────────────── */}
      {showBanner && (
        <div className="fixed bottom-20 md:bottom-4 left-3 right-3 md:left-auto md:right-4 md:max-w-xs z-[100] animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden">
            <div className="flex items-start gap-3 p-4">
              {/* App icon */}
              <div className="shrink-0 w-12 h-12 rounded-xl overflow-hidden shadow-md">
                <img src="/icon-192.png" alt="DTrek" className="w-full h-full object-cover" />
              </div>
              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-stone-800 text-sm leading-tight">
                  Installa Diario Trekking
                </p>
                <p className="text-stone-500 text-xs mt-0.5 leading-snug">
                  {platform === 'ios'
                    ? 'Aggiungi alla Home Screen per usarla offline'
                    : 'Installala sul dispositivo per accesso rapido'}
                </p>
              </div>
              {/* Dismiss */}
              <button
                onClick={dismiss}
                className="shrink-0 w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 hover:text-stone-600 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="px-4 pb-4">
              <button
                onClick={handleInstall}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-forest-600 hover:bg-forest-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {platform === 'ios'
                  ? <><Share className="w-4 h-4" /> Come installare</>
                  : <><ArrowDownToLine className="w-4 h-4" /> Installa app</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── iOS install guide modal ─────────────────────────────────────── */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-end">
          <div className="w-full bg-white rounded-t-3xl px-6 pt-5 pb-10 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-stone-800 text-base">
                Aggiungi alla Home Screen
              </h2>
              <button
                onClick={() => { setShowIOSGuide(false); dismiss() }}
                className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ol className="space-y-4">
              {[
                {
                  n: 1,
                  icon: '⬆️',
                  text: 'Tocca il pulsante Condividi nella barra di Safari',
                },
                {
                  n: 2,
                  icon: '➕',
                  text: 'Scorri verso il basso e seleziona "Aggiungi a Home"',
                },
                {
                  n: 3,
                  icon: '✅',
                  text: 'Tocca "Aggiungi" in alto a destra per confermare',
                },
              ].map((step) => (
                <li key={step.n} className="flex items-start gap-3">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-forest-100 text-forest-700 flex items-center justify-center text-sm font-bold">
                    {step.n}
                  </span>
                  <div className="flex items-start gap-2 pt-0.5">
                    <span className="text-xl leading-none">{step.icon}</span>
                    <p className="text-stone-600 text-sm leading-snug">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-6 p-3 bg-forest-50 rounded-xl flex items-center gap-3">
              <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-xl shadow" />
              <div>
                <p className="text-sm font-semibold text-forest-800">Diario Trekking</p>
                <p className="text-xs text-forest-600">Apparirà come app nativa</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
