'use client'
// "Le mie Raccolte" — elenco delle collane pubblicabili, docs/raccolte-pubblicazione-piano.md
// Fase 3d. Sobria e non uno scaffale a sé: le raccolte sono poche per natura (una collana ha
// senso editoriale solo con qualche volume dentro), un elenco a righe basta.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar, { MOBILE_BOTTOMBAR_SPACER } from '@/components/Navbar'
import { TaccuinoPaperTexture, TaccuinoRuledLines, TACCUINO_PAPER, TACCUINO_INK, TACCUINO_ACCENT, TACCUINO_ACCENT_TINT, FONT_HAND, INK_ABSORB_STYLE, TACCUINO_RULED_TEXT_STYLE } from '@/lib/taccuinoTokens'
import { FONT } from '@/lib/designTokens'
import type { CollectionSummary } from '@/app/api/collections/route'
import { ArrowLeft, BookMarked, Loader2, Plus } from 'lucide-react'

function RaccoltaRow({ raccolta }: { raccolta: CollectionSummary }) {
  return (
    <Link
      href={`/raccolte/${encodeURIComponent(raccolta.id)}`}
      className="flex items-center gap-3 rounded-xl px-3.5 py-3"
      style={{ background: TACCUINO_PAPER.card, border: `1px solid ${TACCUINO_PAPER.cardBorder}` }}
    >
      <div
        className="w-11 h-11 rounded-lg shrink-0 flex items-center justify-center"
        style={{ background: 'linear-gradient(160deg,#7A5A3C,#2E2A22)' }}
      >
        <BookMarked className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.8)' }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate" style={{ fontFamily: FONT.lora, fontWeight: 600, fontSize: 14, color: TACCUINO_INK.typed }}>
            {raccolta.title}
          </p>
          {raccolta.isPublished && (
            <span
              className="px-1.5 py-0.5 rounded shrink-0"
              style={{ background: TACCUINO_ACCENT_TINT, color: TACCUINO_ACCENT[600], fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}
            >
              Pubblicata
            </span>
          )}
        </div>
        <p style={{ fontSize: 10.5, color: TACCUINO_INK.handMuted, marginTop: 2 }}>
          {raccolta.volumeCount} {raccolta.volumeCount === 1 ? 'volume' : 'volumi'}
          {raccolta.volumeCount > 0 && ` · ${raccolta.reportageCount} reportage · ${(raccolta.distanceMeters / 1000).toFixed(0)} km`}
        </p>
      </div>
    </Link>
  )
}

export default function RaccoltePage() {
  const router = useRouter()
  const [raccolte, setRaccolte] = useState<CollectionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/collections')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setRaccolte)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  async function handleCreate() {
    if (creating) return
    setCreating(true)
    setBlockedMessage(null)
    try {
      const res = await fetch('/api/collections', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setBlockedMessage(data.message ?? 'Impossibile creare la raccolta.')
        return
      }
      router.push(`/raccolte/${encodeURIComponent(data.id)}`)
    } catch {
      setBlockedMessage('Errore di rete. Riprova.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className={`relative min-h-screen ${MOBILE_BOTTOMBAR_SPACER}`}>
      <TaccuinoPaperTexture />
      <TaccuinoRuledLines />
      <Navbar />
      <div className="max-w-[640px] mx-auto px-4 sm:px-8 pb-14" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 28px)' }}>
        <Link href="/diari" className="inline-flex items-center gap-1.5 mb-4" style={{ color: TACCUINO_INK.hand, fontSize: 12.5 }}>
          <ArrowLeft className="w-3.5 h-3.5" /> Diari
        </Link>

        <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 11, color: TACCUINO_INK.hand, ...TACCUINO_RULED_TEXT_STYLE }} className="mb-1.5">
          Pubblicazione
        </p>
        <h1 style={{ fontFamily: FONT_HAND, fontWeight: 700, fontSize: 34, ...INK_ABSORB_STYLE, ...TACCUINO_RULED_TEXT_STYLE }} className="mb-6">
          Le mie Raccolte
        </h1>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-6">
            Impossibile caricare le tue raccolte: {error}
          </p>
        )}

        {raccolte === null && !error ? (
          <div className="flex items-center justify-center py-24 gap-3" style={{ color: TACCUINO_INK.handMuted }}>
            <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 mb-4">
              {raccolte?.map(r => <RaccoltaRow key={r.id} raccolta={r} />)}
              {raccolte?.length === 0 && (
                <p style={{ fontSize: 13, color: TACCUINO_INK.hand }}>
                  Nessuna raccolta ancora — una raccolta mette insieme più Diari in un&rsquo;unica
                  collana pubblicabile, senza spostarli da dove sono.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center justify-center gap-2 h-11 rounded-xl w-full disabled:opacity-60"
              style={{ border: `1.5px dashed ${TACCUINO_PAPER.cardBorder}`, color: TACCUINO_INK.hand, fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 11 }}
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Nuova raccolta
            </button>
            {blockedMessage && (
              <p className="text-[11.5px] text-center mt-2" style={{ color: TACCUINO_INK.hand }}>
                {blockedMessage}{' '}
                <a href="/prezzi" className="underline" style={{ color: TACCUINO_ACCENT[600] }}>Sblocca Dtrek</a>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
