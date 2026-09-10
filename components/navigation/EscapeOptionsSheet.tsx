'use client'
import Sheet from '@/components/ui/Sheet'
import type { EscapeOption, EscapeSafety } from '@/lib/navigation/escapeEngine'
import { ArrowUp, Loader2, MapPinned, Milestone, RefreshCw, ShieldAlert } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  loading: boolean
  options: EscapeOption[] | null
  onRefresh: () => void
}

const KIND_ICON: Record<EscapeOption['kind'], typeof MapPinned> = {
  back_to_route: Milestone,
  alternative_trail: Milestone,
  road: Milestone,
  safe_poi: MapPinned,
}

const SAFETY_STYLE: Record<EscapeSafety, { label: string; className: string }> = {
  alta: { label: 'Alta sicurezza', className: 'bg-forest-100 text-forest-700' },
  media: { label: 'Media sicurezza', className: 'bg-amber-100 text-amber-800' },
  bassa: { label: 'Bassa sicurezza', className: 'bg-red-100 text-red-700' },
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

/**
 * Escape Engine (spec §11) results — a ranked list of ways out when the
 * planned route is lost, each with a distance, a safety estimate, and
 * (always) an explanation of why it's being suggested. Snapshot-based: the
 * options are computed once when opened (lib/navigation/escapeEngine.ts's
 * graph search isn't cheap enough to re-run on every GPS fix), with an
 * explicit refresh action rather than silently going stale.
 */
export default function EscapeOptionsSheet({ open, onClose, loading, options, onRefresh }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Vie d'uscita">
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-stone-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Cerco le opzioni…
        </div>
      ) : !options || options.length === 0 ? (
        <div className="flex flex-col items-center text-center gap-3 py-8">
          <ShieldAlert className="w-8 h-8 text-stone-300" />
          <p className="text-sm text-stone-500">
            Nessuna opzione trovata. Se hai scaricato il pacchetto offline di questo percorso, la rete
            sentieri potrebbe non essere ancora disponibile — riprova, o torna semplicemente indietro
            lungo la tua traccia.
          </p>
          <button onClick={onRefresh} className="flex items-center gap-2 text-sm font-semibold text-sky-700">
            <RefreshCw className="w-4 h-4" /> Riprova
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {options.map((opt, i) => {
            const Icon = KIND_ICON[opt.kind]
            const safety = SAFETY_STYLE[opt.safety]
            return (
              <div key={`${opt.kind}-${i}`} className="rounded-2xl border border-stone-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-sky-50 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-sky-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-stone-800 text-sm">{i + 1}. {opt.label}</p>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${safety.className}`}>{safety.label}</span>
                    </div>
                    <p className="text-xs text-stone-500 mt-0.5">{formatDistance(opt.distanceM)}</p>
                    <p className="text-xs text-stone-500 mt-1.5 leading-snug">{opt.reason}</p>
                  </div>
                  <ArrowUp className="w-5 h-5 text-sky-700 shrink-0 mt-1" style={{ transform: `rotate(${opt.bearingDeg}deg)` }} />
                </div>
              </div>
            )
          })}
          <button onClick={onRefresh} className="flex items-center justify-center gap-2 text-sm font-semibold text-sky-700 mt-1 py-2">
            <RefreshCw className="w-4 h-4" /> Aggiorna
          </button>
        </div>
      )}
    </Sheet>
  )
}
