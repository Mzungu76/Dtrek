'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Navbar, { MOBILE_BOTTOMBAR_SPACER } from '@/components/Navbar'
import BackLink from '@/app/components/BackLink'
import RouteThumb from '@/components/RouteThumb'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, TACCUINO_RULED_TEXT_STYLE, TaccuinoPaperTexture, TaccuinoRuledLines } from '@/lib/taccuinoTokens'
import { FONT } from '@/lib/designTokens'
import { META_TYPES, META_TYPE_CONFIG, metaHasHikingMetrics, type MetaType } from '@/lib/metaTypes'
import type { AllPercorsiRow } from '@/app/api/percorsi/route'
import { ArrowRight, Loader2, Mountain } from 'lucide-react'

const FILTRO_TUTTI = 'tutti' as const
type Filtro = MetaType | typeof FILTRO_TUTTI

/**
 * Tavola "Salvate" dell'Atlante — le Mete trovate cercando, messe da parte, senza ancora una
 * data né un Diario (docs/libreria-atlante-piano.md, Fase 2). È l'attuale GET /api/percorsi
 * filtrato: niente reportage E niente diaryId — una Meta con un Diario è già una voce "in
 * programma" di quel Diario, non sta più qui.
 */
export default function SalvatePage() {
  const [rows, setRows] = useState<AllPercorsiRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_TUTTI)

  useEffect(() => {
    fetch('/api/percorsi')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setRows)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const salvate = useMemo(() => (rows ?? []).filter(r => r.reportageCount === 0 && !r.diaryId), [rows])
  const visibili = useMemo(() => filtro === FILTRO_TUTTI ? salvate : salvate.filter(r => r.metaType === filtro), [salvate, filtro])

  const conteggiPerTipo = useMemo(() => {
    const m = new Map<MetaType, number>()
    for (const r of salvate) m.set(r.metaType, (m.get(r.metaType) ?? 0) + 1)
    return m
  }, [salvate])

  return (
    <div className={`relative min-h-screen ${MOBILE_BOTTOMBAR_SPACER}`}>
      <TaccuinoPaperTexture />
      <TaccuinoRuledLines />
      <Navbar />

      <div className="max-w-[520px] mx-auto px-4 sm:px-8" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)', paddingBottom: 40 }}>
        <BackLink className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-stone-600 transition" />

        <h1 className="mt-3 mb-1" style={{ fontFamily: FONT.lora, fontWeight: 700, fontSize: 24, color: TACCUINO_INK.typed }}>Salvate</h1>
        <p style={{ fontSize: 12, color: TACCUINO_INK.hand, ...TACCUINO_RULED_TEXT_STYLE }} className="mb-4 max-w-[42ch]">
          Messe da parte mentre cercavi. Nessuna ha ancora una data: appena gliela dai, non stanno più qui.
        </p>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            Impossibile caricare le Salvate: {error}
          </p>
        )}

        {rows === null && !error ? (
          <div className="flex items-center justify-center py-16 gap-2" style={{ color: TACCUINO_INK.handMuted }}>
            <Loader2 className="w-5 h-5 animate-spin" /><span style={{ fontSize: 12 }}>Caricamento…</span>
          </div>
        ) : salvate.length === 0 ? (
          <p style={{ fontSize: 13, color: TACCUINO_INK.hand }}>Nessuna meta salvata — cerca qualcosa dall&rsquo;Atlante.</p>
        ) : (
          <>
            <div className="flex gap-1.5 mb-4 overflow-x-auto">
              <button
                onClick={() => setFiltro(FILTRO_TUTTI)}
                className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold"
                style={filtro === FILTRO_TUTTI
                  ? { background: TACCUINO_ACCENT[600], color: TACCUINO_PAPER.light }
                  : { background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}`, color: TACCUINO_INK.hand }}
              >
                Tutte <span style={{ opacity: .7 }}>{salvate.length}</span>
              </button>
              {META_TYPES.filter(t => (conteggiPerTipo.get(t) ?? 0) > 0).map(t => (
                <button
                  key={t}
                  onClick={() => setFiltro(t)}
                  className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold"
                  style={filtro === t
                    ? { background: TACCUINO_ACCENT[600], color: TACCUINO_PAPER.light }
                    : { background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}`, color: TACCUINO_INK.hand }}
                >
                  {META_TYPE_CONFIG[t].pluralLabel} <span style={{ opacity: .7 }}>{conteggiPerTipo.get(t)}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              {visibili.map(r => (
                <div key={r.id} className="rounded-2xl overflow-hidden" style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <div className="w-11 h-11 rounded-lg shrink-0 overflow-hidden relative" style={{ background: TACCUINO_PAPER.base }}>
                      {r.routePolyline && r.routePolyline.length > 1
                        ? <RouteThumb polyline={r.routePolyline} color={TACCUINO_ACCENT[600]} strokeWidth={2.5} />
                        : <div className="w-full h-full flex items-center justify-center"><Mountain className="w-4 h-4" style={{ color: '#c9b98a' }} /></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate" style={{ fontFamily: FONT.lora, fontWeight: 600, fontSize: 13.5, color: TACCUINO_INK.typed }}>{r.title}</p>
                      <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 10.5, color: TACCUINO_INK.hand }}>
                        {metaHasHikingMetrics(r.metaType) ? (
                          <>
                            <span>{(r.distanceMeters / 1000).toFixed(1)} km</span>
                            <span>+{Math.round(r.elevationGain)} m</span>
                          </>
                        ) : (
                          <span>{META_TYPE_CONFIG[r.metaType].label}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/atlante/salvate/${encodeURIComponent(r.id)}/aggiungi`}
                    className="flex items-center justify-center gap-1.5 mx-3 mb-3 h-9 rounded-full text-[12px] font-semibold"
                    style={{ background: TACCUINO_ACCENT[600], color: TACCUINO_PAPER.light }}
                  >
                    Aggiungi ad un Diario <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
