'use client'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Navbar, { MOBILE_BOTTOMBAR_SPACER } from '@/components/Navbar'
import BackLink from '@/app/components/BackLink'
import RouteThumb from '@/components/RouteThumb'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, TaccuinoPaperTexture, TaccuinoRuledLines } from '@/lib/taccuinoTokens'
import { FONT } from '@/lib/designTokens'
import { metaHasHikingMetrics, META_TYPE_CONFIG } from '@/lib/metaTypes'
import { updatePlannedMeta } from '@/lib/plannedStore'
import type { DiarySummary } from '@/lib/diari/aggregateDiaries'
import type { AllPercorsiRow } from '@/app/api/percorsi/route'
import { ArrowRight, Loader2, Mountain, Sparkles } from 'lucide-react'

/**
 * Il ponte fra l'Atlante e la Libreria — "Aggiungi ad un Diario" (docs/libreria-atlante-piano.md,
 * Fase 3). Tre sole decisioni umane: come si chiama, quando, in quale Diario. Tutto il resto
 * (traccia, profilo, sezioni di Guida, dati di sicurezza) è già stato scritto quando la Meta è
 * nata dalla ricerca — qui non si rigenera nulla, si assegna solo diaryId/plannedDate: un PATCH
 * su un campo che esiste già (planned_hikes.diary_id), non una migrazione nuova.
 */
export default function AggiungiADiarioPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const metaId = params.id

  const [rows, setRows] = useState<AllPercorsiRow[] | null>(null)
  const [diaries, setDiaries] = useState<DiarySummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  const [data, setData] = useState('')
  const [diaryId, setDiaryId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/percorsi')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setRows)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))

    fetch('/api/diaries')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: DiarySummary[]) => {
        setDiaries(d)
        const attivi = d.filter(x => !x.archivedAt)
        setDiaryId(attivi.find(x => x.isDefault)?.id ?? attivi[0]?.id ?? null)
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const meta = useMemo(() => rows?.find(r => r.id === metaId) ?? null, [rows, metaId])

  useEffect(() => {
    if (meta && !titleTouched) setTitle(meta.title)
    if (meta?.plannedDate) setData(meta.plannedDate)
  }, [meta, titleTouched])

  const diariAttivi = useMemo(() => (diaries ?? []).filter(d => !d.archivedAt), [diaries])

  async function salva() {
    if (!diaryId || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await updatePlannedMeta(metaId, {
        title: title.trim() || meta?.title,
        plannedDate: data || undefined,
        diaryId,
      })
      router.push(`/diari/${encodeURIComponent(diaryId)}/percorsi/${encodeURIComponent(metaId)}/guida/prima_di_partire`)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  const loading = rows === null || diaries === null

  return (
    <div className={`relative min-h-screen ${MOBILE_BOTTOMBAR_SPACER}`}>
      <TaccuinoPaperTexture />
      <TaccuinoRuledLines />
      <Navbar />

      <div className="max-w-[520px] mx-auto px-4 sm:px-8" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)', paddingBottom: 40 }}>
        <BackLink className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-stone-600 transition" />

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mt-3">
            Impossibile caricare: {error}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2" style={{ color: TACCUINO_INK.handMuted }}>
            <Loader2 className="w-5 h-5 animate-spin" /><span style={{ fontSize: 12 }}>Caricamento…</span>
          </div>
        ) : !meta ? (
          <p className="mt-4" style={{ fontSize: 13, color: TACCUINO_INK.hand }}>Meta non trovata — potrebbe essere già stata trascritta.</p>
        ) : (
          <>
            <p className="mt-3 mb-1.5" style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 10, color: TACCUINO_INK.hand }}>
              Trovata nell&rsquo;Atlante
            </p>
            <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5 mb-5" style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
              <div className="w-11 h-11 rounded-lg shrink-0 overflow-hidden relative" style={{ background: TACCUINO_PAPER.base }}>
                {meta.routePolyline && meta.routePolyline.length > 1
                  ? <RouteThumb polyline={meta.routePolyline} color={TACCUINO_ACCENT[600]} strokeWidth={2.5} />
                  : <div className="w-full h-full flex items-center justify-center"><Mountain className="w-4 h-4" style={{ color: '#c9b98a' }} /></div>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate" style={{ fontFamily: FONT.lora, fontWeight: 600, fontSize: 13.5, color: TACCUINO_INK.typed }}>{meta.title}</p>
                <p style={{ fontSize: 10.5, color: TACCUINO_INK.hand }}>
                  {metaHasHikingMetrics(meta.metaType)
                    ? <>{(meta.distanceMeters / 1000).toFixed(1)} km &middot; +{Math.round(meta.elevationGain)} m</>
                    : META_TYPE_CONFIG[meta.metaType].label}
                </p>
              </div>
            </div>

            <div className="rounded-2xl px-4 py-4" style={{ background: TACCUINO_PAPER.light, border: `1px solid ${TACCUINO_PAPER.contourLine}` }}>
              <label className="block mb-4">
                <span className="block mb-1" style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 9, color: TACCUINO_INK.handMuted }}>
                  Titolo della voce
                </span>
                <input
                  value={title}
                  onChange={e => { setTitle(e.target.value); setTitleTouched(true) }}
                  className="w-full px-3 py-2 rounded-lg text-[15px] outline-none"
                  style={{ fontFamily: FONT.lora, fontWeight: 600, background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}`, color: TACCUINO_INK.typed }}
                />
              </label>

              <label className="block mb-4">
                <span className="block mb-1" style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 9, color: TACCUINO_INK.handMuted }}>
                  Quando (facoltativo)
                </span>
                <input
                  type="date"
                  value={data}
                  onChange={e => setData(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-[14px] outline-none"
                  style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}`, color: TACCUINO_INK.typed }}
                />
              </label>

              <label className="block mb-1">
                <span className="block mb-1" style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 9, color: TACCUINO_INK.handMuted }}>
                  In quale Diario
                </span>
                <select
                  value={diaryId ?? ''}
                  onChange={e => setDiaryId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-[14px] outline-none"
                  style={{ fontFamily: FONT.lora, fontWeight: 600, background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}`, color: TACCUINO_INK.typed }}
                >
                  {diariAttivi.map(d => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
              </label>

              <div className="flex items-start gap-2 mt-4 mb-1" style={{ fontSize: 11, color: TACCUINO_INK.handMuted, fontFamily: FONT.lora }}>
                <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>La traccia, il profilo, la Guida e i dati di sicurezza si scrivono da soli — nel taccuino di carta li avresti copiati a mano.</span>
              </div>

              {saveError && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{saveError}</p>
              )}

              <button
                onClick={salva}
                disabled={saving || !diaryId}
                className="w-full flex items-center justify-center gap-2 h-12 rounded-xl font-semibold text-[14px] mt-4 disabled:opacity-60"
                style={{ background: TACCUINO_ACCENT[600], color: TACCUINO_PAPER.light }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Aggiungi <ArrowRight className="w-4 h-4" /></>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
