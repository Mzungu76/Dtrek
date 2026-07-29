'use client'
import { useEffect, useState } from 'react'
import { Bus, TrainFront, CarTaxiFront, Loader2, Undo2 } from 'lucide-react'
import type { ReturnOption, ReturnOptionKind } from '@/lib/routeBuilder/returnOptions'

const RADIUS_M = 1000

const KIND_ICON: Record<ReturnOptionKind, typeof Bus> = {
  bus: Bus,
  treno: TrainFront,
  taxi: CarTaxiFront,
}

/** Percorso a sola andata — servizi di trasporto (bus/treno/taxi) trovati entro RADIUS_M dal punto
 *  di arrivo, per chi non vuole tornare a piedi sui propri passi. Dato geografico reale (Overpass,
 *  vedi lib/routeBuilder/returnOptions.ts), non una stima o una ricerca AI: se non c'è nulla mappato
 *  nei dintorni lo dice esplicitamente, invece di indovinare. */
export default function ReturnOptionsCard({ endLat, endLon }: { endLat: number; endLon: number }) {
  const [options, setOptions] = useState<ReturnOption[] | null>(null)

  useEffect(() => {
    setOptions(null)
    let cancelled = false
    fetch(`/api/route-build/return-options?lat=${endLat}&lon=${endLon}&radius=${RADIUS_M}`)
      .then(res => res.json())
      .then(data => { if (!cancelled) setOptions(Array.isArray(data.options) ? data.options : []) })
      .catch(() => { if (!cancelled) setOptions([]) })
    return () => { cancelled = true }
  }, [endLat, endLon])

  return (
    <div className="bg-white rounded-2xl mb-4 overflow-hidden shadow-sm">
      <div className="flex items-center gap-3 px-5 py-3" style={{ background: '#813619' }}>
        <div className="w-1.5 h-6 rounded-full bg-white/25 shrink-0" />
        <div className="flex items-center gap-2 text-white">
          <Undo2 className="w-4 h-4 opacity-80" />
          <h2 className="font-display text-[12px] font-bold tracking-[2px] uppercase">Tornare al punto di partenza</h2>
        </div>
      </div>

      <div className="px-5 py-5 sm:px-6">
        <p className="text-[13px] text-stone-500 mb-4">
          Percorso a sola andata — ecco cosa c&apos;è entro {(RADIUS_M / 1000).toFixed(1)} km dal punto di arrivo per tornare senza rifare a piedi lo stesso tratto.
        </p>

        {options === null && (
          <p className="flex items-center gap-1.5 text-[13px] text-stone-400 italic">
            <Loader2 className="w-3 h-3 animate-spin" /> Cerco fermate e stazioni nei dintorni…
          </p>
        )}

        {options !== null && options.length === 0 && (
          <p className="text-[13px] text-stone-500">
            Nessuna fermata bus, stazione o posteggio taxi mappato entro {(RADIUS_M / 1000).toFixed(1)} km dal punto di arrivo — probabilmente conviene organizzare il ritorno in autonomia (auto/bici lasciata alla partenza, passaggio concordato).
          </p>
        )}

        {options !== null && options.length > 0 && (
          <ul className="space-y-2.5">
            {options.map((opt, i) => {
              const Icon = KIND_ICON[opt.kind]
              return (
                <li key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center shrink-0 text-stone-600">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-stone-700 truncate">{opt.name || opt.label}</p>
                    {opt.name && <p className="text-[12px] text-stone-400">{opt.label}</p>}
                  </div>
                  <span className="text-[12px] font-semibold text-stone-500 shrink-0">{opt.distanceMeters} m</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
