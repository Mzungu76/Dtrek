'use client'
// Drawer laterale per cambiare Diario senza lasciare la pagina — Fase 11 di
// docs/diario-a-libro-piano.md. Aperto dal bottone "Indice" della barra inferiore del Sommario
// (vedi BookPage.tsx's onIndexClick, Fase 17), che ora è la home dell'app: senza questo, l'unico
// modo per vedere gli altri Diari sarebbe tornare allo scaffale (/diari) perdendo il punto in cui
// si era.
//
// Elenco compatto: ogni riga mostra una miniatura dell'EFFETTIVA copertina del Diario (foto o
// gradiente di default, più titolo/sottotitolo/autore in scala — DiarioCoverThumb con `width`,
// richiesto esplicitamente dall'utente) più conteggio Percorsi. Le copertine grandi dello
// scaffale restano lì, raggiungibile dal link in fondo insieme a "+ Nuovo Diario".
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Loader2, Pencil, X } from 'lucide-react'
import type { DiarySummary } from '@/app/api/diaries/route'
import { DiarioCoverThumb } from '@/components/diario/DiarioCoverThumb'
import { FONT } from '@/lib/designTokens'

const PAPER_BG = '#fbf6e8'
const PAPER_HAIRLINE = '#e4d9bd'
const INK_MUTED = '#a9915f'
const INK_TEXT = '#3f3a22'
const PILL_BG = '#f1e9d2'

export default function DiarioSwitcherDrawer({
  open, onClose, currentDiaryId,
}: { open: boolean; onClose: () => void; currentDiaryId: string }) {
  const [diaries, setDiaries] = useState<DiarySummary[] | null>(null)

  useEffect(() => {
    if (!open) return
    fetch('/api/diaries')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setDiaries)
      .catch(() => setDiaries([]))
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        className="absolute left-0 top-0 bottom-0 w-[280px] sm:w-[320px] flex flex-col shadow-2xl"
        style={{ background: PAPER_BG, fontFamily: FONT.body }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: PAPER_HAIRLINE }}>
          <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 11, color: INK_MUTED }}>
            I miei Diari
          </p>
          <button onClick={onClose} aria-label="Chiudi" style={{ color: INK_MUTED }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {diaries === null ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: INK_MUTED }} />
            </div>
          ) : diaries.length === 0 ? (
            <p className="px-2 py-4 text-[13px]" style={{ color: INK_MUTED }}>Nessun Diario trovato.</p>
          ) : (
            diaries.map(d => {
              const active = d.id === currentDiaryId
              return (
                // Non un unico <Link> come nella riga precedente (pre pencil): la matita apre la
                // copertina dell'editor completo in /pubblica (foto + testi, vedi quella pagina),
                // un link a sé che non può stare annidato dentro quello che apre il Sommario.
                <div
                  key={d.id}
                  className="flex items-center gap-2 px-2 py-2 rounded-lg transition-colors"
                  style={active ? { background: PILL_BG } : undefined}
                >
                  <Link
                    href={`/diari/${encodeURIComponent(d.id)}`}
                    onClick={onClose}
                    className="flex items-center gap-3 flex-1 min-w-0"
                  >
                    <DiarioCoverThumb
                      coverUrl={d.coverUrl}
                      width={36}
                      title={d.title}
                      subtitle={d.subtitle}
                      author={d.author}
                      className="rounded-[3px] shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate" style={{ fontSize: 13.5, fontWeight: 600, color: INK_TEXT }}>{d.title}</p>
                      <p style={{ fontSize: 11, color: INK_MUTED }}>
                        {d.percorsiCount} {d.percorsiCount === 1 ? 'percorso' : 'percorsi'}
                      </p>
                    </div>
                    {active && <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: INK_MUTED }} />}
                  </Link>
                  <Link
                    href={`/diari/${encodeURIComponent(d.id)}/copertina`}
                    onClick={onClose}
                    title="Personalizza copertina"
                    className="shrink-0 p-1.5 rounded-full hover:opacity-70 transition-opacity"
                    style={{ color: INK_MUTED }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )
            })
          )}
        </div>

        <div className="px-3 py-3 border-t" style={{ borderColor: PAPER_HAIRLINE }}>
          <Link
            href="/diari"
            onClick={onClose}
            className="flex items-center justify-between gap-2 px-2 py-2 rounded-lg"
            style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 11, color: '#6b6142' }}
          >
            Scaffale, copertine, nuovo Diario
            <ChevronRight className="w-3.5 h-3.5" style={{ color: INK_MUTED }} />
          </Link>
        </div>
      </div>
    </div>
  )
}
