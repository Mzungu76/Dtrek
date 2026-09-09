'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Navbar, { MOBILE_BOTTOMBAR_SPACER } from '@/components/Navbar'
import BookSpineShadow from '@/components/libro/BookSpineShadow'
import { DiarioCoverThumb } from '@/components/diario/DiarioCoverThumb'
import { ProssimaUscitaCard } from '@/components/diari/ProssimaUscitaCard'
import { ScaffaliBanner } from '@/components/libreria/ScaffaliBanner'
import type { DiarySummary } from '@/lib/diari/aggregateDiaries'
import { selezionaProssimaUscita } from '@/lib/diari/prossimaUscita'
import type { AllPercorsiRow } from '@/app/api/percorsi/route'
import type { CollectionSummary } from '@/app/api/collections/route'
import { getUserSettingsCached, updateUserSettings } from '@/lib/sync/userSettingsStore'
import { FONT } from '@/lib/designTokens'
import { TACCUINO_PAPER, TACCUINO_INK, TACCUINO_RULED_TEXT_STYLE, TaccuinoPaperTexture, TaccuinoRuledLines } from '@/lib/taccuinoTokens'
import { ArrowRight, BookMarked, Loader2 } from 'lucide-react'

const HERO_COVER_WIDTH = 236

function formatKm(distanceMeters: number): string {
  return (distanceMeters / 1000).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/**
 * "Libreria" — la nuova prima pagina: la copertina del Diario in uso, una alla volta, con lo
 * scaffale sempre indicato in testata e il banner degli scaffali sotto (docs/libreria-atlante-
 * piano.md, Fase 1). Sostituisce lo scaffale-griglia precedente. Lo swipe passa fra i Diari dello
 * STESSO scaffale — per cambiare scaffale si apre il banner, non si continua a scorrere.
 *
 * L'app si apre sempre qui (vedi app/page.tsx, ora un semplice redirect): questa pagina risolve
 * da sola l'ultimo Diario aperto (lastDiaryId), la stessa risoluzione che prima viveva lì.
 */
export default function LibreriaPage() {
  const [diaries, setDiaries] = useState<DiarySummary[] | null>(null)
  const [diariesError, setDiariesError] = useState<string | null>(null)
  // Gli scaffali sono le Raccolte (supabase/migrations/merge_shelves_into_collections.sql) — un
  // solo fetch, non più due stati separati per due concetti che ora sono lo stesso.
  const [shelves, setShelves] = useState<CollectionSummary[] | null>(null)
  const [percorsi, setPercorsi] = useState<AllPercorsiRow[] | null>(null)
  const [currentDiaryId, setCurrentDiaryId] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    fetch('/api/diaries')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setDiaries)
      .catch(e => setDiariesError(e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(() => {
    fetch('/api/collections')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setShelves)
      .catch(() => setShelves([]))
  }, [])

  useEffect(() => {
    fetch('/api/percorsi')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setPercorsi)
      .catch(() => setPercorsi(null))
  }, [])

  // Risolve l'ultimo Diario aperto — stessa logica che prima viveva in app/page.tsx (Fase 11 di
  // docs/diario-a-libro-piano.md): il Diario ricordato potrebbe non esistere più o essere stato
  // archiviato nel frattempo, verificato contro l'elenco vero.
  useEffect(() => {
    if (!diaries || currentDiaryId) return
    let cancelled = false
    getUserSettingsCached().then(settings => {
      if (cancelled) return
      const attivi = diaries.filter(d => !d.archivedAt)
      const target = attivi.find(d => d.id === settings.lastDiaryId) ?? attivi.find(d => d.isDefault) ?? attivi[0] ?? diaries[0]
      if (target) setCurrentDiaryId(target.id)
    })
    return () => { cancelled = true }
  }, [diaries, currentDiaryId])

  const diariAttivi = useMemo(() => (diaries ?? []).filter(d => !d.archivedAt), [diaries])
  const currentDiary = useMemo(() => diariAttivi.find(d => d.id === currentDiaryId) ?? null, [diariAttivi, currentDiaryId])
  const shelfDiaries = useMemo(
    () => diariAttivi.filter(d => d.shelfId === currentDiary?.shelfId).sort((a, b) => a.shelfPosition - b.shelfPosition),
    [diariAttivi, currentDiary],
  )
  const indexInShelf = shelfDiaries.findIndex(d => d.id === currentDiaryId)

  function selectDiary(id: string) {
    setCurrentDiaryId(id)
    updateUserSettings({ lastDiaryId: id }).catch(() => {})
  }

  // Scorre il carosello sul Diario corrente quando cambia da fuori (banner, o il primo Diario
  // risolto) — se lo scroll è già lì (l'utente ha appena swipato lui stesso) non fa nulla, per
  // non litigare con lo scroll momentum del touch.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || indexInShelf < 0 || el.clientWidth === 0) return
    const target = indexInShelf * el.clientWidth
    if (Math.abs(el.scrollLeft - target) > 4) el.scrollTo({ left: target })
  }, [indexInShelf])

  function onCarouselScroll() {
    clearTimeout(scrollTimer.current)
    scrollTimer.current = setTimeout(() => {
      const el = scrollRef.current
      if (!el || el.clientWidth === 0) return
      const idx = Math.round(el.scrollLeft / el.clientWidth)
      const d = shelfDiaries[idx]
      if (d && d.id !== currentDiaryId) selectDiary(d.id)
    }, 80)
  }

  const prossimaUscita = useMemo(() => percorsi ? selezionaProssimaUscita(percorsi) : null, [percorsi])

  const loading = diaries === null || shelves === null || !currentDiary

  return (
    <div className={`relative min-h-screen ${MOBILE_BOTTOMBAR_SPACER}`}>
      <TaccuinoPaperTexture />
      <TaccuinoRuledLines />
      <Navbar />
      <BookSpineShadow variant="light" />

      <div className="max-w-[520px] mx-auto px-4 sm:px-8" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)', paddingBottom: 168 }}>
        {diariesError && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            Impossibile caricare la Libreria: {diariesError}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24 gap-3" style={{ color: TACCUINO_INK.handMuted }}>
            <Loader2 className="w-6 h-6 animate-spin" /><span style={TACCUINO_RULED_TEXT_STYLE}>Caricamento…</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 mb-1">
              <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: 10.5, color: TACCUINO_INK.hand, ...TACCUINO_RULED_TEXT_STYLE }}>
                {shelves.find(s => s.id === currentDiary.shelfId)?.title ?? 'Libreria'}
              </p>
              {shelfDiaries.length > 1 && (
                <p style={{ fontFamily: FONT.mono, fontSize: 10.5, color: TACCUINO_INK.handMuted }}>
                  {indexInShelf + 1} di {shelfDiaries.length}
                </p>
              )}
            </div>

            <div
              ref={scrollRef}
              onScroll={onCarouselScroll}
              className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar -mx-4 sm:-mx-8 px-4 sm:px-8"
              style={{ scrollbarWidth: 'none' }}
            >
              {shelfDiaries.map(d => (
                <div key={d.id} className="snap-center shrink-0 w-full flex flex-col items-center py-3">
                  <div className="rounded shadow-lg overflow-hidden" style={{ boxShadow: '0 12px 26px rgba(46,42,34,.30)' }}>
                    <Link href={`/diari/${encodeURIComponent(d.id)}`}>
                      <DiarioCoverThumb coverUrl={d.coverUrl} width={HERO_COVER_WIDTH} title={d.title} subtitle={d.subtitle} author={d.author} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {shelfDiaries.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 mb-3">
                {shelfDiaries.map((d, i) => (
                  <span
                    key={d.id}
                    className="block rounded-full transition-all"
                    style={{ width: i === indexInShelf ? 16 : 5, height: 5, background: i === indexInShelf ? TACCUINO_INK.hand : TACCUINO_PAPER.cardBorder }}
                  />
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 mt-2 mb-4">
              <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
                <p style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 15, color: TACCUINO_INK.typed }}>{currentDiary.reportageCount}</p>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: TACCUINO_INK.handMuted }}>reportage</p>
              </div>
              <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
                <p style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 15, color: TACCUINO_INK.typed }}>{formatKm(currentDiary.distanceMeters)}</p>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: TACCUINO_INK.handMuted }}>km</p>
              </div>
              <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}>
                <p style={{ fontFamily: FONT.mono, fontWeight: 700, fontSize: 15, color: TACCUINO_INK.typed }}>+{Math.round(currentDiary.elevationGain)}</p>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: TACCUINO_INK.handMuted }}>D+ m</p>
              </div>
            </div>

            <ProssimaUscitaCard candidata={prossimaUscita} />

            <Link
              href={`/diari/${encodeURIComponent(currentDiary.id)}`}
              className="flex items-center justify-center gap-2 mt-4 mb-2 h-12 rounded-xl font-semibold text-[14px]"
              style={{ background: TACCUINO_INK.typed, color: TACCUINO_PAPER.light }}
            >
              <BookMarked className="w-4 h-4" /> Apri l&rsquo;indice <ArrowRight className="w-4 h-4" />
            </Link>
          </>
        )}
      </div>

      {!loading && (
        <ScaffaliBanner
          shelves={shelves}
          diaries={diariAttivi}
          currentShelfId={currentDiary.shelfId}
          currentDiaryId={currentDiary.id}
          onSelectDiary={selectDiary}
          onDiaryMoved={(diaryId, shelfId, shelfPosition) => {
            setDiaries(prev => prev ? prev.map(d => d.id === diaryId ? { ...d, shelfId, shelfPosition } : d) : prev)
          }}
          onShelfCreated={shelf => setShelves(prev => prev ? [...prev, shelf] : [shelf])}
        />
      )}
    </div>
  )
}
