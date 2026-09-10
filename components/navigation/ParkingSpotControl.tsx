'use client'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Car, Navigation2, Trash2, MapPin, X } from 'lucide-react'
import type { ParkingSpot } from '@/lib/navigation/navigationStore'
import { useModalBackHandler } from '@/lib/navigation/useModalBackHandler'

interface Props {
  spot: ParkingSpot | null
  /** Posizione GPS corrente — assente finché non arriva il primo fix: senza, non c'è nulla da
   *  fissare né una distanza da mostrare. */
  position: { lat: number; lon: number } | null
  /** Distanza in linea d'aria dalla posizione corrente al punto auto, in metri. Null senza uno dei due. */
  distanceM: number | null
  /** Direzione bussola (0-360, nord in alto) verso l'auto — ruota la freccia. Null senza uno dei due. */
  bearingToSpotDeg: number | null
  onSave: () => void
  onClear: () => void
}

function formatDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

/**
 * "Dove ho lasciato l'auto" — un tocco per fissare le coordinate del parcheggio all'inizio
 * dell'uscita, poi distanza e direzione sempre a portata di sguardo per ritrovarla alla fine.
 *
 * Esiste perché il punto di partenza della traccia e il punto in cui si è davvero parcheggiato
 * spesso non coincidono (parcheggio pieno, sterrata chiusa, sosta lungo la strada), e a fine giro
 * — stanchi, magari al buio — è proprio la differenza tra i due a diventare un problema.
 *
 * Chiuso è un solo bottone rotondo, coerente con gli altri controlli della rotaia. Il dettaglio è
 * un popup centrato (portato in document.body, stesso trattamento di TrailConfidenceBadge) invece
 * di un pannellino ancorato al bottone: questo controllo vive dentro un contenitore posizionato
 * (la rotaia azioni), che crea un proprio contesto di stacking — un pannellino ancorato lì dentro
 * poteva finire coperto da un avviso dichiarato dopo nel DOM anche con uno z-index nominalmente
 * più alto. Nessuna navigazione passo-passo verso l'auto: la freccia e i metri bastano per gli
 * ultimi minuti a piedi, e inventare un secondo motore di navigazione dentro quello già in corso
 * sarebbe più confuso che utile.
 */
export default function ParkingSpotControl({ spot, position, distanceM, bearingToSpotDeg, onSave, onClear }: Props) {
  const [open, setOpen] = useState(false)
  useModalBackHandler(open, () => setOpen(false))

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={spot ? 'Dove ho lasciato l’auto' : 'Segna dove ho lasciato l’auto'}
        className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg border ${
          spot ? 'bg-stone-800 border-stone-600 text-white' : 'bg-white/95 border-stone-200 text-stone-700'
        }`}
      >
        <Car className="w-5 h-5" />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[3000] bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-5 font-body" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-semibold text-stone-900">Punto auto</h2>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 hover:text-stone-600 transition-colors shrink-0" aria-label="Chiudi">
                <X className="w-4 h-4" />
              </button>
            </div>

            {spot ? (
              <>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span
                    className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center shrink-0"
                    style={bearingToSpotDeg != null ? { transform: `rotate(${bearingToSpotDeg}deg)` } : undefined}
                  >
                    <Navigation2 className="w-4 h-4 text-stone-700" fill="currentColor" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-stone-900 font-mono leading-none">
                      {distanceM != null ? formatDist(distanceM) : '—'}
                    </p>
                    <p className="text-[11px] text-stone-400 mt-0.5">in linea d&apos;aria dall&apos;auto</p>
                  </div>
                </div>
                <p className="text-[10.5px] text-stone-400 font-mono mb-3">
                  {spot.lat.toFixed(5)}, {spot.lon.toFixed(5)}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={onSave}
                    disabled={!position}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-stone-800 text-white text-sm font-semibold disabled:opacity-40"
                  >
                    <MapPin className="w-3.5 h-3.5" /> Sposta qui
                  </button>
                  <button
                    onClick={() => { onClear(); setOpen(false) }}
                    className="flex items-center justify-center px-3 py-2.5 rounded-xl border border-stone-200 text-stone-500"
                    aria-label="Rimuovi il punto auto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-stone-600 leading-relaxed mb-4">
                  Fissa qui le coordinate del parcheggio: a fine giro avrai sempre distanza e
                  direzione per ritrovare l&apos;auto, anche se hai lasciato la macchina lontano
                  dall&apos;inizio del sentiero.
                </p>
                <button
                  onClick={() => { onSave(); setOpen(false) }}
                  disabled={!position}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-stone-800 text-white text-sm font-semibold disabled:opacity-40"
                >
                  <MapPin className="w-4 h-4" />
                  {position ? 'Sono parcheggiato qui' : 'In attesa del GPS…'}
                </button>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
