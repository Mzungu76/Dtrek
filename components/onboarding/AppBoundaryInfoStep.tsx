'use client'
import { Compass, MapPinned, ChevronRight } from 'lucide-react'

interface Props {
  /** 'dtrek' = mostrato nell'app web Dtrek, spiega dove trovare Navigator.
   *  'navigator' = mostrato nell'app nativa Navigator, spiega dove trovare Dtrek. */
  variant: 'dtrek' | 'navigator'
  onDone: () => void
}

const COPY = {
  dtrek: {
    icon: Compass,
    title: 'Due app, un solo account',
    body: 'Qui in Dtrek pianifichi le tue escursioni, scrivi il diario e vedi le tue statistiche. Per navigare via GPS mentre cammini sul sentiero c\'è DTrek Navigator, un\'app gratuita a parte pensata per restare leggera e affidabile in cammino. Non serve installarla subito: la trovi quando ti serve, dal pulsante "Naviga" su un percorso pianificato.',
    cta: 'Ho capito',
  },
  navigator: {
    icon: MapPinned,
    title: 'Benvenuto in DTrek Navigator',
    body: 'Questa è l\'app gratuita per navigare via GPS sul sentiero: mappa, posizione, vie d\'uscita, SOS. Pianificare nuovi percorsi, scrivere il diario e vedere le statistiche si fa invece in Dtrek, l\'app principale — la trovi al tocco su "Apri Dtrek" quando vuoi passare.',
    cta: 'Ho capito, si parte',
  },
} as const

/**
 * UX-AUDIT.md P-C1/P0-2 — mostrato una sola volta per dispositivo (lib/onboarding/appBoundaryPref.ts),
 * alla primissima apertura di ciascuna delle due shell, PRIMA che l'utente incontri un pulsante
 * "Naviga"/"Apri Dtrek" senza contesto pregresso. Stesso linguaggio visivo delle altre schermate di
 * onboarding (GiftRouteStep.tsx, NavOnboardingSheet.tsx) — nessun nuovo pattern da imparare.
 */
export default function AppBoundaryInfoStep({ variant, onDone }: Props) {
  const { icon: Icon, title, body, cta } = COPY[variant]
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
      <div className="relative w-full sm:max-w-md bg-white rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 pt-6 pb-2 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-forest-50 border border-forest-200 flex items-center justify-center shrink-0">
            <Icon className="w-4.5 h-4.5 text-forest-600" />
          </div>
        </div>
        <div className="px-6 py-5 space-y-2">
          <h2 className="font-display text-lg font-semibold text-stone-800">{title}</h2>
          <p className="text-sm text-stone-500 leading-relaxed">{body}</p>
        </div>
        <div className="px-6 pb-6 pt-2">
          <button
            onClick={onDone}
            className="w-full flex items-center justify-center gap-2 py-3 bg-forest-600 hover:bg-forest-700 text-white rounded-xl font-semibold transition-colors"
          >
            {cta} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
