'use client'
import { useEffect, useState } from 'react'
import { AlertOctagon, Phone, MessageSquareText, MapPin, Radio, SignalHigh, SignalLow, SignalZero } from 'lucide-react'
import Sheet from '@/components/ui/Sheet'
import { buildEmergencyCallLink, buildEmergencySmsLink, formatCoordinatesForDisplay, type EmergencyFix } from '@/lib/navigation/sos'
import { readConnectionQuality, watchConnectionQuality, type ConnectionQuality } from '@/lib/navigation/connectionQuality'

interface Props {
  /** Letta direttamente dallo stato di posizione già in memoria (nessuna chiamata di rete) —
   *  vedi vincolo "fail-safe UI" della Fase 2: deve funzionare anche con rete assente o motore
   *  di navigazione in stato degradato (gps_lost/off_route). */
  fix: EmergencyFix | null
  /** Link di condivisione live già attivo (Fase 1), se c'è — livello 4, mai un sostituto dei
   *  primi tre. */
  liveShareUrl: string | null
  onTriggered?: (action: 'call' | 'sms') => void
}

/**
 * Fase 2 di docs/navigator-orizzonti-roadmap.md — quattro livelli in ordine di affidabilità
 * decrescente, non equivalenti: chiamata (garantita in UE), SMS (best-effort, non ovunque),
 * coordinate a schermo (sempre disponibili, nessuna azione richiesta), link live (extra).
 */
// DTREK-AUDIT.md P2 #28 — segnale live (non predittivo), non un giudizio, quindi neutro invece di
// allarmante quando è 'sconosciuta' (browser senza Network Information API, es. Safari/iOS).
const QUALITY_STYLE: Record<ConnectionQuality, { Icon: typeof SignalHigh; label: string; className: string }> = {
  buona: { Icon: SignalHigh, label: 'Segnale dati buono in questo momento', className: 'text-emerald-700' },
  debole: { Icon: SignalLow, label: 'Segnale dati debole in questo momento — la chiamata può comunque funzionare anche senza dati', className: 'text-amber-700' },
  sconosciuta: { Icon: SignalZero, label: 'Qualità del segnale non rilevabile su questo dispositivo', className: 'text-stone-400' },
}

export default function SosButton({ fix, liveShareUrl, onTriggered }: Props) {
  const [open, setOpen] = useState(false)
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>('sconosciuta')

  useEffect(() => {
    setConnectionQuality(readConnectionQuality())
    return watchConnectionQuality(setConnectionQuality)
  }, [])

  return (
    <>
      {/* Soluzione B: nessuna posizione propria — il chiamante lo monta nella rotaia azioni a
          bordo schermo (ActiveNavigationView.tsx), sempre a un tocco ma senza un secondo z-index
          fisso indipendente che possa scontrarsi con gli altri controlli in alto. */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Emergenza"
        className="w-11 h-11 rounded-full bg-red-600 border-2 border-white/70 shadow-lg flex items-center justify-center active:scale-95 transition-transform shrink-0"
      >
        <AlertOctagon className="w-5 h-5 text-white" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Emergenza">
        <div className="space-y-3">
          {/* DTREK-AUDIT.md P2 #28 — segnale live del dispositivo, mai una previsione di
              copertura lungo il percorso (nessun dataset disponibile per quello): risponde solo
              a "adesso, qui, come va il segnale", non a "avrò campo più avanti". */}
          {(() => {
            const { Icon, label, className } = QUALITY_STYLE[connectionQuality]
            return (
              <div className={`flex items-center gap-2 text-xs ${className}`}>
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{label}</span>
              </div>
            )
          })()}

          <a
            href={buildEmergencyCallLink()}
            onClick={() => onTriggered?.('call')}
            className="w-full flex items-center gap-3 p-4 rounded-xl bg-red-600 text-white shadow-sm active:scale-[0.98] transition-transform"
          >
            <Phone className="w-5 h-5 shrink-0" />
            <div className="text-left">
              <p className="text-sm font-bold">Chiama il 112</p>
              <p className="text-xs text-red-100">Numero di emergenza unico europeo</p>
            </div>
          </a>

          <a
            href={buildEmergencySmsLink(fix)}
            onClick={() => onTriggered?.('sms')}
            className="w-full flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 shadow-sm active:scale-[0.98] transition-transform"
          >
            <MessageSquareText className="w-5 h-5 shrink-0 text-amber-600" />
            <div className="text-left">
              <p className="text-sm font-bold text-amber-900">Prova a inviare un SMS al 112</p>
              <p className="text-xs text-amber-700">Non garantito ovunque — non tutti i paesi UE lo supportano per il pubblico generico</p>
            </div>
          </a>

          <div className="p-4 rounded-xl bg-stone-100 border border-stone-200">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="w-4 h-4 text-stone-500 shrink-0" />
              <p className="text-xs font-semibold text-stone-600 uppercase tracking-wide">La tua posizione</p>
            </div>
            <p className="text-sm font-mono text-stone-800 select-all">
              {fix ? formatCoordinatesForDisplay(fix) : 'Non ancora disponibile — attendi un segnale GPS'}
            </p>
            <p className="text-xs text-stone-500 mt-1">Sempre leggibile qui anche senza rete o segnale telefonico — puoi dettarla a voce.</p>
          </div>

          {liveShareUrl && (
            <div className="p-4 rounded-xl bg-sky-50 border border-sky-200">
              <div className="flex items-center gap-2 mb-1">
                <Radio className="w-4 h-4 text-sky-600 shrink-0" />
                <p className="text-xs font-semibold text-sky-700 uppercase tracking-wide">Posizione live già condivisa</p>
              </div>
              <p className="text-xs text-sky-700 break-all select-all">{liveShareUrl}</p>
            </div>
          )}
        </div>
      </Sheet>
    </>
  )
}
