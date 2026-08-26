'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import type { DiarySummary } from '@/app/api/diaries/route'
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'
import { FONT } from '@/lib/designTokens'
import { ArrowRight, BookMarked, BookOpen, Compass, Loader2, Lock, LockOpen, Pencil } from 'lucide-react'

/**
 * "I miei Diari" — Fase 1 di docs/diario-fulcro-piano.md (sola lettura). Home del Diario: ogni
 * Diario è una raccolta di Percorsi, pubblicabile solo se almeno uno di essi ha almeno un
 * Reportage (vedi app/api/diaries/route.ts). "Il mio Diario" (di default) è sempre il primo e
 * non elencato/eliminabile da qui — quella gestione arriva in una fase successiva.
 */
function DiariPageClassico() {
  const [diaries, setDiaries] = useState<DiarySummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/diaries')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setDiaries)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <div className={`min-h-screen bg-stone-50 md:pb-0 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />

      <div className="relative h-[200px] sm:h-[240px] overflow-hidden bg-gradient-to-br from-forest-800 to-forest-900">
        <div className="absolute inset-0 bg-gradient-to-b from-forest-900/15 to-forest-900/85" />
        <div className="absolute left-6 right-6 bottom-6 sm:left-10 sm:right-10 sm:bottom-8">
          <p className="text-forest-300 text-[13px] font-semibold mb-1.5">Diario</p>
          <h1 className="font-display text-[24px] sm:text-3xl font-bold text-white leading-tight">
            I miei Diari
          </h1>
        </div>
      </div>

      <main className="max-w-[900px] mx-auto px-4 py-6 sm:py-8">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            Impossibile caricare i tuoi Diari: {error}
          </p>
        )}

        {diaries === null && !error ? (
          <div className="flex items-center justify-center py-24 text-stone-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Link
              href="/percorsi"
              className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3.5 border border-stone-200 hover:border-forest-300 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-forest-50 text-forest-600 flex items-center justify-center shrink-0">
                <Compass className="w-4.5 h-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-bold text-stone-800">Tutti i Percorsi</p>
                <p className="text-[12px] text-stone-500">Ritrova un percorso in qualunque Diario, senza doverlo ricordare</p>
              </div>
              <ArrowRight className="w-4 h-4 text-stone-300 shrink-0" />
            </Link>
            {diaries?.map(d => (
              <Link
                key={d.id}
                href={`/diari/${encodeURIComponent(d.id)}`}
                className={`flex items-center gap-4 bg-white rounded-2xl px-4 py-4 shadow-sm hover:shadow-md transition-shadow border ${d.isDefault ? 'border-forest-300' : 'border-stone-200'}`}
              >
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${d.coverUrl ? '' : 'bg-forest-50'}`}>
                  {d.coverUrl
                    ? <img src={d.coverUrl} alt="" className="w-14 h-14 rounded-xl object-cover" />
                    : <BookMarked className="w-6 h-6 text-forest-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  {d.isDefault && (
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-forest-700 bg-forest-50 px-2 py-0.5 rounded-full mb-1">
                      Diario di default
                    </span>
                  )}
                  <p className="font-display text-[16px] font-bold text-stone-800 truncate">{d.title}</p>
                  <div className="flex items-center gap-2 text-[13px] text-stone-500 mt-0.5">
                    <span>{d.percorsiCount} {d.percorsiCount === 1 ? 'percorso' : 'percorsi'}</span>
                    <span className="text-stone-300">·</span>
                    {d.pubblicabile ? (
                      <span className="inline-flex items-center gap-1 text-forest-700 font-medium">
                        <LockOpen className="w-3 h-3" /> Pubblicabile
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-stone-400">
                        <Lock className="w-3 h-3" /> Non ancora pubblicabile
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// Palette delle copertine — nessun campo "tema colore" esiste nello schema reale (solo
// diaries.cover_url, una foto), a differenza del mockup che alternava 3 gradienti come scelta
// dell'utente. Qui si cicla per indice: varietà visiva senza inventare un campo nuovo per
// qualcosa che nessuno può ancora impostare.
const COVER_GRADIENTS = [
  'linear-gradient(160deg,#2a4d1f,#152112)',
  'linear-gradient(160deg,#9a4a22,#4d2213)',
  'linear-gradient(160deg,#8a6a1f,#3d2e0d)',
]

/**
 * Copertina di un Diario — stessa identità visiva validata nel mockup "Diario a schermo intero"
 * (artifact 2e1f7d0a-5d69-4e17-9c8b-038aa651e13b, funzione shelfCoverHtml/.bk-cover): dorso di
 * libro verticale, taglio pagine sul bordo destro, titolo/occhiello/sottotitolo centrati.
 * Adattamento deliberato rispetto al mockup: qui è una riga scorrevole di copertine reali (link
 * cliccabili, niente drag/swipe a schermo intero) invece di un carosello a una copertina alla
 * volta — più utilizzabile su desktop, e senza reimplementare una gestura che non si può
 * verificare a schermo in questa sandbox.
 */
function DiarioCoverCard({ d, index }: { d: DiarySummary; index: number }) {
  const gradient = COVER_GRADIENTS[index % COVER_GRADIENTS.length]
  return (
    // Non un unico <Link> come nel mockup: "Personalizza" (foto/testi di copertina, già esistenti
    // in /pubblica — non un editor nuovo) deve restare un link a sé, non annidato nel link che
    // apre il Diario.
    <div className="flex flex-col items-center gap-3 shrink-0 w-[168px] sm:w-[190px]">
      <Link href={`/diari/${encodeURIComponent(d.id)}`} className="w-full flex flex-col items-center">
      <div
        className="relative w-full rounded-[6px] overflow-hidden"
        style={{
          aspectRatio: '3 / 4',
          background: d.coverUrl ? undefined : gradient,
          boxShadow: '0 22px 44px -18px rgba(0,0,0,0.6), 0 2px 0 rgba(255,255,255,0.06) inset',
        }}
      >
        {d.coverUrl && (
          <img src={d.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {d.coverUrl && <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/60" />}
        {/* Taglio pagine — un filo di carta sul bordo destro, l'unico indizio "è un libro" utile
            visto così, di taglio. */}
        <span
          className="absolute top-[3%] bottom-[3%] -right-[2px] w-1.5 rounded-r-[3px]"
          style={{
            background: 'repeating-linear-gradient(180deg, #efe6cf 0 2px, #e2d6b8 2px 4px)',
            boxShadow: '1px 0 3px rgba(0,0,0,0.3)',
          }}
        />
        <div
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-[10%]"
          style={{ border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6 }}
        >
          <div className="absolute inset-2 rounded-[3px] pointer-events-none" style={{ border: '1px solid rgba(255,255,255,0.16)' }} />
          {d.isDefault && (
            <span
              className="absolute top-3 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full whitespace-nowrap"
              style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 9.5, color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.16)' }}
            >
              Diario di default
            </span>
          )}
          <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: 9.5, color: 'rgba(255,255,255,0.5)', margin: '0 0 12px' }}>
            Taccuino N° {index + 1}
          </p>
          <BookOpen className="w-8 h-8 mb-3.5" style={{ color: 'rgba(255,255,255,0.75)' }} />
          <p style={{ fontFamily: FONT.display, fontWeight: 600, color: '#fdf8ea', fontSize: 21, lineHeight: 1.2, textWrap: 'balance' as const }}>
            {d.title}
          </p>
          {d.subtitle && (
            <p style={{ fontFamily: FONT.lora, fontStyle: 'italic', fontSize: 11.5, color: 'rgba(255,255,255,0.72)', marginTop: 7, textWrap: 'balance' as const }}>
              {d.subtitle}
            </p>
          )}
          <span className="w-7 h-px my-3.5" style={{ background: 'rgba(255,255,255,0.35)' }} />
          <p style={{ fontFamily: FONT.barlow, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10.5, color: 'rgba(255,255,255,0.6)' }}>
            {d.percorsiCount} {d.percorsiCount === 1 ? 'percorso' : 'percorsi'}
            {d.percorsiCount > 0 && ` · ${d.pubblicabile ? 'pubblicabile' : 'non pubblicabile'}`}
          </p>
        </div>
      </div>
      <span
        className="inline-flex items-center gap-2 px-4 py-2 mt-3 rounded-full text-white"
        style={{ background: '#c05a17', fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 12.5 }}
      >
        <BookOpen className="w-3.5 h-3.5" /> Apri Diario
      </span>
      </Link>
      <Link
        href={`/diari/${encodeURIComponent(d.id)}/pubblica`}
        className="inline-flex items-center gap-1.5 text-[11.5px]"
        style={{ color: 'rgba(255,255,255,0.45)' }}
      >
        <Pencil className="w-3 h-3" /> Personalizza copertina
      </Link>
    </div>
  )
}

function DiariPageLibro() {
  const [diaries, setDiaries] = useState<DiarySummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/diaries')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setDiaries)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <div className={`min-h-screen ${MOBILE_TOPBAR_SPACER}`} style={{ background: 'radial-gradient(ellipse at 50% 0%, #453b2c 0%, #2a2419 70%)' }}>
      <Navbar />
      <div className="max-w-[1100px] mx-auto px-4 sm:px-8 pt-8 pb-14">
        <p style={{ fontFamily: FONT.barlow, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 11, color: 'rgba(255,255,255,0.45)' }} className="mb-1.5">
          Diario
        </p>
        <h1 style={{ fontFamily: FONT.display, fontWeight: 600, fontSize: 26, color: '#fdf8ea' }} className="mb-8">
          I miei Diari
        </h1>

        {error && (
          <p className="text-sm text-red-300 bg-red-950/40 border border-red-900 rounded-xl px-4 py-3 mb-6">
            Impossibile caricare i tuoi Diari: {error}
          </p>
        )}

        {diaries === null && !error ? (
          <div className="flex items-center justify-center py-24 gap-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
            <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
          </div>
        ) : (
          <>
            <div className="flex gap-6 sm:gap-8 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
              {diaries?.map((d, i) => <DiarioCoverCard key={d.id} d={d} index={i} />)}
            </div>
            <Link
              href="/percorsi"
              className="inline-flex items-center gap-2 mt-4 text-[13px] hover:text-white transition-colors"
              style={{ color: 'rgba(255,255,255,0.55)' }}
            >
              <Compass className="w-4 h-4" /> Tutti i Percorsi, in ogni Diario <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </>
        )}
      </div>
    </div>
  )
}

export default function DiariPage() {
  const [libroEnabled, setLibroEnabled] = useState<boolean | null>(null)
  useEffect(() => {
    getUserSettingsCached()
      .then(d => setLibroEnabled(d.diarioLibroEnabled === true))
      .catch(() => setLibroEnabled(false))
  }, [])

  if (libroEnabled === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-stone-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  return libroEnabled ? <DiariPageLibro /> : <DiariPageClassico />
}
