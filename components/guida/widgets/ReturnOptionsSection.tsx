'use client'
import { Bus, TrainFront, CarTaxiFront, Loader2, ExternalLink } from 'lucide-react'
import { sectionHeading } from '@/components/routehub/overlayTheme'
import { buildReturnOptionMapsUrl, type ReturnOption, type ReturnOptionKind } from '@/lib/routeBuilder/returnOptions'

const RADIUS_KM = 1

const KIND_ICON: Record<ReturnOptionKind, typeof Bus> = {
  bus: Bus,
  treno: TrainFront,
  taxi: CarTaxiFront,
}

/** Sottosezione di "Luoghi da non perdere" per i percorsi a sola andata — gli stessi servizi di
 *  trasporto (bus/treno/taxi) sono già mostrati come pin sulla mappa dei POI qui sopra (vedi
 *  returnMarkers in PoiListWidget.tsx); questo elenco dà il dettaglio testuale (distanza, nome,
 *  indicazioni sulla mappa) che un pin da solo non può dare. Dato geografico reale (Overpass), non
 *  un'ipotesi generata. */
export default function ReturnOptionsSection({ options, origin }: {
  options: ReturnOption[] | null
  origin: { lat: number; lon: number }
}) {
  return (
    <div className="space-y-2.5">
      <p className={`${sectionHeading} pt-1`}>Tornare al punto di partenza</p>
      <p className="text-[13px] text-stone-500 -mt-1.5">
        Percorso a sola andata — servizi entro {RADIUS_KM.toFixed(1)} km dal punto di arrivo, per chi non vuole tornare a piedi sui propri passi.
      </p>

      {options === null && (
        <p className="flex items-center gap-1.5 text-[13px] text-stone-400 italic">
          <Loader2 className="w-3 h-3 animate-spin" /> Cerco fermate e stazioni nei dintorni…
        </p>
      )}

      {options !== null && options.length === 0 && (
        <p className="text-[13px] text-stone-500">
          Nessuna fermata bus, stazione o posteggio taxi mappato entro {RADIUS_KM.toFixed(1)} km dal punto di arrivo.
        </p>
      )}

      {options !== null && options.length > 0 && (
        <ul className="space-y-2">
          {options.map((opt, i) => {
            const Icon = KIND_ICON[opt.kind]
            return (
              <li key={i} className="flex items-center gap-3 bg-stone-50 rounded-xl px-3 py-2.5">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 text-sky-700 border border-stone-200">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-stone-700 truncate">{opt.name || opt.label}</p>
                  <p className="text-[12px] text-stone-400">{opt.name ? opt.label : null}{opt.name ? ' · ' : ''}{opt.distanceMeters} m</p>
                </div>
                <a
                  href={buildReturnOptionMapsUrl(origin, opt)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Indicazioni sulla mappa"
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white border border-stone-200 hover:border-sky-300 text-[11px] font-semibold text-sky-700 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> Indicazioni
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
