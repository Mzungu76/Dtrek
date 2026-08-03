'use client'
import { ArrowRight, Repeat, Info, Loader2 } from 'lucide-react'
import type { RouteMode } from '@/lib/routeMode'

interface Props {
  /** Cifre della sola andata, così l'utente sceglie vedendo i due scenari a confronto invece che al buio. */
  distanceMeters: number
  elevationGain: number
  /** Durata stimata della sola andata, già formattata dal chiamante (formatDuration). */
  durationLabel: string
  /** Durata stimata dell'andata e ritorno, già formattata dal chiamante. */
  durationRoundTripLabel: string
  onChoose: (mode: RouteMode) => void
  /** True mentre la scelta viene salvata e i punteggi ricalcolati — il popup resta aperto e
   *  disabilitato invece di chiudersi subito, altrimenti la generazione AI potrebbe partire
   *  mentre routeMode non è ancora arrivato nello stato del chiamante. */
  saving?: boolean
}

function Option({
  icon, title, distance, elevation, duration, onClick, disabled, accent,
}: {
  icon: React.ReactNode; title: string; distance: string; elevation: string; duration: string
  onClick: () => void; disabled?: boolean; accent: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-stone-200 hover:border-stone-300 hover:bg-stone-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${accent}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-stone-800">{title}</span>
        <span className="block text-[11.5px] text-stone-500 font-mono">{distance} · {elevation} · {duration}</span>
      </span>
    </button>
  )
}

/**
 * Scelta obbligatoria della tipologia di percorrenza per un percorso lineare appena importato.
 *
 * Non è una preferenza di visualizzazione: distanza, dislivello e durata effettivi (e quindi TEI,
 * Comfort TrailScore e Sicurezza) dipendono da questa risposta — vedi lib/routeMode.ts. Va posta
 * PRIMA che Giulia scriva i testi, perché il prompt riceve le cifre effettive: una guida scritta
 * per una sola andata continuerebbe a parlare di quella anche dopo un cambio successivo, dato che
 * i testi già generati non si riscrivono da soli (detto esplicitamente qui sotto).
 *
 * Deliberatamente senza "X" né chiusura cliccando fuori: le due opzioni sono le uniche uscite.
 */
export default function RouteModeDialog({
  distanceMeters, elevationGain, durationLabel, durationRoundTripLabel, onChoose, saving,
}: Props) {
  const km = distanceMeters / 1000
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-6 pt-5 pb-3">
          <h2 className="font-display font-bold text-stone-800 text-lg">Come percorri questo itinerario?</h2>
          <p className="text-[13px] text-stone-500 leading-snug mt-1">
            La traccia importata è a tratta unica: parte e arriva in due punti diversi. Dicci se torni
            sui tuoi passi — è il dato da cui dipendono tutte le cifre di questa guida.
          </p>
        </div>

        <div className="px-6 pb-4 space-y-2">
          <Option
            icon={<ArrowRight className="w-4 h-4 text-sky-700" />}
            accent="bg-sky-100"
            title="Sola andata"
            distance={`${km.toFixed(1)} km`}
            elevation={`+${Math.round(elevationGain)} m`}
            duration={durationLabel}
            onClick={() => onChoose('one_way')}
            disabled={saving}
          />
          <Option
            icon={<Repeat className="w-4 h-4 text-forest-700" />}
            accent="bg-forest-100"
            title="Andata e ritorno"
            distance={`${(km * 2).toFixed(1)} km`}
            elevation={`+${Math.round(elevationGain * 2)} m`}
            duration={durationRoundTripLabel}
            onClick={() => onChoose('round_trip')}
            disabled={saving}
          />
        </div>

        <div className="mx-6 mb-6 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-200">
          <Info className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
          <p className="text-[11.5px] text-stone-500 leading-snug">
            Potrai cambiare idea in qualsiasi momento dalla striscia dei dati, e i punteggi
            (Trail Score, Sicurezza, TEI) si ricalcoleranno da soli. <strong className="font-semibold text-stone-600">I
            testi già scritti da Giulia no</strong>: restano quelli generati con la tipologia scelta ora,
            e per riallinearli va rigenerata la sezione.
          </p>
        </div>

        {saving && (
          <div className="px-6 pb-5 -mt-3 flex items-center gap-2 text-[12px] text-stone-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Aggiorno i punteggi…
          </div>
        )}
      </div>
    </div>
  )
}
