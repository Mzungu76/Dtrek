'use client'
import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { SERVICE_META, type ServiceCategory, type ServiceItem } from '@/lib/cammini/services'
import { placeServices, countByCategory, serviceGaps, waterAdvice } from '@/lib/cammini/serviceGaps'
import { SERVICE_STYLE } from '../serviceIcons'

export const SERVICE_ORDER: ServiceCategory[] = ['water', 'food', 'shop', 'lodging', 'transport', 'pharmacy']
const km = (m: number) => `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`

interface Props {
  /** undefined = in lettura; null = non disponibili; [] = nessuno mappato. */
  services: ServiceItem[] | null | undefined
  polyline: [number, number][]
  lengthM: number
  /** Categorie mostrate sulla mappa. */
  visible: ReadonlySet<ServiceCategory>
  onToggle: (c: ServiceCategory) => void
}

/** "Acqua e servizi" di una tappa: le categorie con l'icona della mappa fanno da filtro, sotto gli avvisi sui tratti senza servizi. */
export default function CamminoServicesStrip({ services, polyline, lengthM, visible, onToggle }: Props) {
  const placed = useMemo(() => placeServices(services ?? [], polyline, lengthM), [services, polyline, lengthM])
  if (services === undefined) return <p className="py-2 text-[12px] text-stone-400">Cerco acqua, alloggi e servizi…</p>
  if (services === null) return <p className="py-2 text-[12px] text-stone-400">Servizi non disponibili adesso: riprova con la rete.</p>

  const counts = countByCategory(placed)
  const gaps = serviceGaps(placed, ['food', 'shop', 'water'], lengthM, 8000)
  const water = waterAdvice(placed, 0, lengthM)
  const warnings: string[] = []
  if (water.nextM == null) warnings.push('Nessuna acqua mappata lungo la tappa: portane abbastanza per tutta la giornata')
  else if (water.nextM >= 8000) warnings.push(`La prima acqua mappata è a ${km(water.nextM)} dalla partenza: parti con le borracce piene`)
  for (const g of gaps.slice(0, 2)) warnings.push(`Nessun servizio per ${km(g.lengthM)} (dal km ${(g.fromM / 1000).toFixed(0)} al km ${(g.toM / 1000).toFixed(0)})`)

  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-3.5 py-3">
      <p className="font-barlow text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Acqua e servizi sulla mappa</p>
      {counts.length === 0 ? (
        <p className="mt-1.5 text-[12.5px] text-stone-600">Nessun servizio mappato lungo questa tappa.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SERVICE_ORDER.map(c => counts.find(x => x.category === c)).filter(Boolean).map(x => {
            const { Icon, color } = SERVICE_STYLE[x!.category]
            const on = visible.has(x!.category)
            return (
              <button
                key={x!.category}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(x!.category)}
                className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[12px] font-semibold transition-colors ${on ? 'border-stone-300 bg-white text-stone-800' : 'border-stone-200 bg-stone-100 text-stone-400'}`}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-[7px]" style={{ background: on ? color : '#d6d3d1' }}><Icon className="h-3.5 w-3.5 text-white" strokeWidth={2.25} /></span>
                {SERVICE_META[x!.category].label} <b className="tabular-nums">{x!.count}</b>
              </button>
            )
          })}
        </div>
      )}
      {warnings.map(w => (
        <p key={w} className="mt-1.5 flex items-start gap-1.5 text-[12px] font-semibold text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</p>
      ))}
      <p className="mt-2 text-[11px] text-stone-400">Dati OpenStreetMap: indicano dove un servizio è mappato, non se è aperto o attivo oggi. Bordo tratteggiato = non verificato.</p>
    </div>
  )
}
