'use client'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { loadTappaServices } from '@/lib/cammini/tappaServices'
import { SERVICE_META, type ServiceCategory, type ServiceItem } from '@/lib/cammini/services'
import { placeServices, countByCategory, serviceGaps, waterAdvice } from '@/lib/cammini/serviceGaps'

const ORDER: ServiceCategory[] = ['water', 'food', 'shop', 'lodging', 'transport', 'pharmacy']
const km = (m: number) => `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`

/** Cosa si trova lungo la tappa (acqua, cibo, negozi, alloggi, trasporti) e i tratti senza servizi, per prepararsi prima di partire. */
export default function CamminoServicesStrip({ camminoId, ordinal, polyline, lengthM }: { camminoId: string; ordinal: number; polyline: [number, number][]; lengthM: number }) {
  const [services, setServices] = useState<ServiceItem[] | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    setServices(undefined)
    loadTappaServices(camminoId, ordinal).then(s => { if (!cancelled) setServices(s) })
    return () => { cancelled = true }
  }, [camminoId, ordinal])

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
      <p className="font-barlow text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">Acqua e servizi</p>
      {counts.length === 0 ? (
        <p className="mt-1.5 text-[12.5px] text-stone-600">Nessun servizio mappato lungo questa tappa.</p>
      ) : (
        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-stone-700">
          {ORDER.map(c => counts.find(x => x.category === c)).filter(Boolean).map(x => (
            <li key={x!.category}><b>{x!.count}</b> {SERVICE_META[x!.category].plural}</li>
          ))}
        </ul>
      )}
      {warnings.map(w => (
        <p key={w} className="mt-1.5 flex items-start gap-1.5 text-[12px] font-semibold text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w}</p>
      ))}
      <p className="mt-2 text-[11px] text-stone-400">Dati OpenStreetMap: indicano dove un servizio è mappato, non se è aperto o attivo oggi.</p>
    </div>
  )
}
