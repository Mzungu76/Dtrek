// Card "prossima uscita" — l'unica azione primaria della pagina, sotto il rail delle tre fasi.
// docs/diari-restyling-piano.md, Fase 1. La Meta mostrata viene scelta da
// lib/diari/prossimaUscita.ts sulle righe di GET /api/percorsi già caricate dalla pagina — nessuna
// chiamata in più.
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Compass, Navigation2 } from 'lucide-react'
import { TrailScoreGaugeBadge } from '@/components/TrailScoreGaugeBadge'
import RouteThumb from '@/components/RouteThumb'
import { FONT } from '@/lib/designTokens'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, TACCUINO_ACCENT_TINT } from '@/lib/taccuinoTokens'
import { metaHasHikingMetrics } from '@/lib/metaTypes'
import type { AllPercorsiRow } from '@/app/api/percorsi/route'

interface Props {
  candidata: AllPercorsiRow | null
}

function formatStima(estimatedTimeSeconds: number): string {
  const h = Math.floor(estimatedTimeSeconds / 3600)
  const m = Math.round((estimatedTimeSeconds % 3600) / 60)
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

export function ProssimaUscitaCard({ candidata }: Props) {
  if (!candidata) {
    return (
      <div
        className="rounded-2xl px-4 py-5 text-center"
        style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}
      >
        <p style={{ fontSize: 13, color: TACCUINO_INK.hand }} className="mb-3">
          Nessuna Meta in attesa — pianificane una per vederla qui.
        </p>
        <Link
          href="/percorsi"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-white"
          style={{ background: TACCUINO_ACCENT[600], fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 12.5 }}
        >
          <Compass className="w-3.5 h-3.5" /> Pianifica una Meta
        </Link>
      </div>
    )
  }

  const guidaHref = `/guida/${encodeURIComponent(candidata.id)}/prima_di_partire`
  const conMetriche = metaHasHikingMetrics(candidata.metaType)

  return (
    <div className="rounded-2xl px-3.5 py-3.5" style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{ background: TACCUINO_ACCENT_TINT, color: TACCUINO_ACCENT[600], fontSize: 10.5, fontWeight: 700 }}
        >
          {candidata.plannedDate
            ? `Prossima uscita · ${format(new Date(candidata.plannedDate), 'EEE d', { locale: it })}`
            : 'Prossima uscita'}
        </span>
        {candidata.diaryTitle && (
          <span
            className="px-2.5 py-1 rounded-full"
            style={{ background: TACCUINO_PAPER.light, border: `1px solid ${TACCUINO_PAPER.cardBorder}`, color: TACCUINO_INK.hand, fontSize: 10.5, fontWeight: 600 }}
          >
            {candidata.diaryTitle}
          </span>
        )}
      </div>

      <p style={{ fontFamily: FONT.display, fontWeight: 700, fontSize: 18, color: TACCUINO_INK.typed, marginTop: 9 }}>
        {candidata.title}
      </p>

      {candidata.routePolyline && candidata.routePolyline.length > 1 && (
        <div
          className="w-full mt-2.5 rounded-xl overflow-hidden"
          style={{ height: 72, background: TACCUINO_PAPER.light, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}
        >
          <RouteThumb polyline={candidata.routePolyline} color={TACCUINO_ACCENT[600]} strokeWidth={2.5} />
        </div>
      )}

      {conMetriche && (
        <div className="flex items-center gap-4 mt-2.5">
          <TrailScoreGaugeBadge total={candidata.trailScore} safety={null} size={46} showLabel={false} dark={false} />
          <div className="grid grid-cols-3 gap-x-4 gap-y-1 flex-1">
            <div>
              <p style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 14, color: TACCUINO_INK.typed, lineHeight: 1 }}>
                {(candidata.distanceMeters / 1000).toFixed(1)}
              </p>
              <p style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: TACCUINO_INK.handMuted }}>km</p>
            </div>
            <div>
              <p style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 14, color: TACCUINO_INK.typed, lineHeight: 1 }}>
                +{Math.round(candidata.elevationGain)}
              </p>
              <p style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: TACCUINO_INK.handMuted }}>D+ m</p>
            </div>
            <div>
              <p style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 14, color: TACCUINO_INK.typed, lineHeight: 1 }}>
                {formatStima(candidata.estimatedTimeSeconds)}
              </p>
              <p style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: TACCUINO_INK.handMuted }}>stima</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 mt-3">
        {/* Navigator è un'app a sé (docs/navigator-dtrek-boundary.md): non esiste un deep-link che
            apra direttamente QUESTA Meta, quindi porta al suo elenco Percorsi invece che a un
            link rotto — colmarlo è un cambiamento sul confine tra le due app, fuori scope qui. */}
        <Link
          href="/navigatore/percorsi"
          className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl text-white"
          style={{ background: TACCUINO_ACCENT[600], fontFamily: FONT.barlow, fontWeight: 700, fontSize: 12.5 }}
        >
          <Navigation2 className="w-4 h-4" /> Apri nel Navigator
        </Link>
        <Link
          href={guidaHref}
          className="flex items-center justify-center gap-2 h-11 px-4 rounded-xl"
          style={{ border: `1.5px solid ${TACCUINO_ACCENT[600]}`, color: TACCUINO_ACCENT[600], fontFamily: FONT.barlow, fontWeight: 700, fontSize: 12.5 }}
        >
          Guida
        </Link>
      </div>
    </div>
  )
}
