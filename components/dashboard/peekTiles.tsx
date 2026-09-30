'use client'
// Tessere del peek (widget fissati sulla mappa della Home) che non si possono riassumere in un testo
// calcolato subito: hanno contenuto che arriva in ritardo o interattivo. Stesso aspetto "vetro" di
// PeekTile in DashboardSheet.tsx.
import { useState } from 'react'
import { useArchivePhoto, PhotoLightbox } from './widgetsExtra'
import { fmtDate } from './widgetKit'
import type { DashboardData } from './types'
import type { DashboardWidgetId } from '@/lib/dashboardConfig'

const GLASS = 'flex-1 min-w-0 rounded-2xl bg-white/14 backdrop-blur-md border border-white/20'
const LABEL = 'font-barlow text-[10px] font-bold tracking-wide uppercase text-white/65 truncate'

/** Foto dal tuo archivio: miniatura che si ingrandisce con un tocco. */
function PhotoPeekTile({ data }: { data: DashboardData }) {
  const { found, another } = useArchivePhoto(data.activities)
  const [open, setOpen] = useState(false)

  if (found === undefined || found === null) {
    return (
      <div className={`${GLASS} p-3.5`}>
        <div className={LABEL}>Dal tuo archivio</div>
        <div className="text-[11px] text-white/60 mt-1">{found === undefined ? 'Cerco una foto…' : 'Nessuna foto ancora'}</div>
      </div>
    )
  }
  return (
    <div className={`${GLASS} p-2 flex items-center gap-2.5`}>
      <button onClick={() => setOpen(true)} aria-label="Ingrandisci la foto" className="shrink-0 w-[60px] h-[60px] rounded-xl overflow-hidden bg-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={found.thumb} alt={found.caption || found.activity.title} className="w-full h-full object-cover" loading="lazy" />
      </button>
      <div className="min-w-0">
        <div className={LABEL}>Dal tuo archivio</div>
        <div className="font-display font-semibold text-[13px] text-white truncate mt-0.5">{found.activity.title}</div>
        <div className="text-[10px] text-white/65 mt-0.5 truncate">{fmtDate(found.activity.startTime)}</div>
      </div>
      {open && <PhotoLightbox photo={found} onClose={() => setOpen(false)} onAnother={another} />}
    </div>
  )
}

export const PEEK_TILES: Partial<Record<DashboardWidgetId, React.ComponentType<{ data: DashboardData }>>> = {
  'foto-diario': PhotoPeekTile,
}
