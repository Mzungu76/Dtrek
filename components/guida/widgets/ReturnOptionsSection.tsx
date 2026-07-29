'use client'
import { Bus, TrainFront, CarTaxiFront, Loader2, ExternalLink, CalendarClock } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { sectionHeading } from '@/components/routehub/overlayTheme'
import { buildReturnOptionMapsUrl, type ReturnOption, type ReturnOptionKind } from '@/lib/routeBuilder/returnOptions'

const RADIUS_KM = 1

const KIND_ICON: Record<ReturnOptionKind, typeof Bus> = {
  bus: Bus,
  treno: TrainFront,
  taxi: CarTaxiFront,
}

// Solo bus/treno sono linee con corse/orari — un posteggio taxi non ha un "orario", il link lì
// resta semplicemente le indicazioni a piedi per raggiungerlo.
const LINK_LABEL: Record<ReturnOptionKind, string> = { bus: 'Orari', treno: 'Orari', taxi: 'Maps' }

/** Sottosezione di "Luoghi da non perdere" per i percorsi a sola andata — gli stessi servizi di
 *  trasporto (bus/treno/taxi) sono già mostrati come pin sulla mappa dei POI qui sopra (vedi
 *  returnMarkers in PoiListWidget.tsx); questo elenco dà il dettaglio testuale (distanza, nome,
 *  link a Google Maps) che un pin da solo non può dare. Dato geografico reale (Overpass), non
 *  un'ipotesi generata — per bus/treno il link apre le indicazioni di Maps in modalità "mezzi
 *  pubblici", che mostra le corse reali della linea (niente orari da recuperare/mantenere noi). */
export default function ReturnOptionsSection({ options, origin, plannedDate }: {
  options: ReturnOption[] | null
  origin: { lat: number; lon: number }
  plannedDate?: string
}) {
  const hasTransit = (options ?? []).some(o => o.kind !== 'taxi')

  return (
    <div className="space-y-2.5">
      <p className={`${sectionHeading} pt-1`}>Tornare al punto di partenza</p>
      <p className="text-[13px] text-stone-500 -mt-1.5">
        Percorso a sola andata — servizi entro {RADIUS_KM.toFixed(1)} km dal punto di arrivo, per chi non vuole tornare a piedi sui propri passi.
      </p>

      {hasTransit && (
        <p className="flex items-start gap-1.5 text-[12px] text-stone-400 italic">
          <CalendarClock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {plannedDate
            ? `"Orari" apre Maps con le corse di adesso — una volta aperto, cambia la data su ${format(new Date(plannedDate + 'T12:00'), 'EEEE d MMMM', { locale: it })} per vedere quelle giuste.`
            : '"Orari" apre Maps con le corse di adesso — se parti un altro giorno, cambia la data una volta dentro Maps.'}
        </p>
      )}

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
                  title={opt.kind === 'taxi' ? 'Indicazioni a piedi su Google Maps' : 'Corse e orari su Google Maps'}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white border border-stone-200 hover:border-sky-300 text-[11px] font-semibold text-sky-700 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> {LINK_LABEL[opt.kind]}
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
