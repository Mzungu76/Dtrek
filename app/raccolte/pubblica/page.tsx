'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, BarChart3, BookText, Camera, ChevronDown, ChevronRight, Copy, ExternalLink,
  LineChart, Loader2, Map, Share2,
} from 'lucide-react'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import Kicker from '@/components/ui/Kicker'
import { PublishPrivacyToggles } from '@/components/PublishPrivacyToggles'
import SectionProfiloPubblico from '@/components/profilo/SectionProfiloPubblico'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import type { MarkedCollectionPreview, PreviewVolume } from '@/lib/raccolte/fetchMarkedCollectionsPreview'
import type { PublishBatchResultRow } from '@/app/api/collections/publish-batch/route'

const SECTION_ICONS: [key: keyof PreviewVolume['show'], label: string, Icon: typeof BookText][] = [
  ['racconto', 'Racconti', BookText],
  ['foto', 'Fotografie', Camera],
  ['percorso', 'Mappe dei percorsi', Map],
  ['statistiche', 'Numeri complessivi', BarChart3],
  ['grafici', 'Grafici', LineChart],
]

function fmtKm(m: number) { return m >= 100_000 ? `${Math.round(m / 1000)} km` : `${(m / 1000).toFixed(1)} km` }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) }

// Pagina di pre-pubblicazione — raggiunta dalla barra fissa "Procedi alla pubblicazione" di
// /raccolte, non da /raccolte/[id]: non è la composizione di UNA Raccolta (quella resta lì, con i
// suoi campi editabili), è la revisione di TUTTE le Raccolte marcate "Pubblica" insieme, prima di
// mandarle online in un solo colpo — coerente col fatto che una Raccolta e i suoi Diari si
// pubblicano sempre tutti insieme, non pezzo per pezzo (decisione esplicita dell'utente).
export default function PrePubblicazionePage() {
  const [collections, setCollections] = useState<MarkedCollectionPreview[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedDiari, setExpandedDiari] = useState<Set<string>>(new Set())
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, string>>({}) // collectionId -> shareToken, dopo "Pubblica tutto"
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/collections/marked-for-publish')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => setCollections(d.collections))
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  function shareTokenFor(c: MarkedCollectionPreview): string | null {
    return results[c.id] ?? c.shareToken
  }

  async function publishAll() {
    setPublishing(true); setPublishError(null)
    try {
      await getBrowserSupabase().auth.getSession()
      const res = await fetch('/api/collections/publish-batch', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      const rows = data.collections as PublishBatchResultRow[]
      setResults(prev => ({ ...prev, ...Object.fromEntries(rows.map(r => [r.id, r.shareToken])) }))
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : String(e))
    } finally {
      setPublishing(false)
    }
  }

  async function copyLink(token: string, id: string) {
    const url = `${window.location.origin}/leggi/c/${token}`
    await navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const totalReportage = (collections ?? []).reduce((s, c) => s + c.totalEntries, 0)
  const publishedCount = (collections ?? []).filter(c => shareTokenFor(c) !== null).length

  return (
    <div className={`min-h-screen bg-stone-50 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar mobileNavPosition="bottom" />
      <div className="max-w-2xl mx-auto px-4 sm:px-8 pb-[calc(env(safe-area-inset-bottom,0px)+80px)] md:pb-16">
        <Link href="/raccolte" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mt-3 mb-5 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Raccolte
        </Link>

        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-stone-800">Pre-pubblicazione</h1>
          <p className="text-sm text-stone-400 mt-1.5">Quello che hai segnato come pubblicabile, pronto per andare online tutto insieme.</p>
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        {collections === null ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>
        ) : (
          <>
            {/* Niente di marcato — "Il tuo sito" e Privacy restano comunque visibili qui sotto:
                gestire il proprio sito (indirizzo, attivazione) non dipende dall'avere qualcosa di
                nuovo da pubblicare in questo momento. */}
            {collections.length === 0 && (
              <p className="text-sm text-stone-400 mb-8">
                Nessuna Raccolta marcata come pubblicabile al momento — <Link href="/raccolte" className="font-semibold text-forest-600 hover:text-forest-700">torna a Raccolte</Link> per marcarne una col pulsante &quot;Pubblica&quot;.
              </p>
            )}

            {collections.length > 0 && (
            <>
            <p className="font-barlow text-xs tracking-wide text-stone-400 mb-4">
              {collections.length} {collections.length === 1 ? 'raccolta' : 'raccolte'} · {totalReportage} reportage
            </p>

            <div className="space-y-6 mb-8">
              {collections.map(c => (
                <div key={c.id}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <p className="font-display font-bold text-base text-stone-800">{c.title}</p>
                    <span className={`inline-flex items-center gap-1 px-2 py-[3px] rounded-full font-barlow font-bold uppercase tracking-wide text-[10px] ${
                      shareTokenFor(c) ? 'bg-forest-50 text-forest-700' : 'bg-terra-100 text-terra-700'
                    }`}>
                      <span className="w-[5px] h-[5px] rounded-full" style={{ background: shareTokenFor(c) ? '#277134' : '#c05a17' }} />
                      {shareTokenFor(c) ? 'già online' : 'pubblicabile'}
                    </span>
                  </div>

                  {c.volumes.length === 0 ? (
                    <p className="text-xs text-stone-400 py-2">Nessun Diario qui — non c&apos;è ancora nulla da pubblicare per questa Raccolta.</p>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {c.volumes.map(v => {
                        const isOpen = expandedDiari.has(v.diaryId)
                        return (
                          <div key={v.diaryId} className="bg-white border border-stone-200 rounded-2xl shadow-sm overflow-hidden">
                            <button
                              onClick={() => setExpandedDiari(s => { const n = new Set(s); n.has(v.diaryId) ? n.delete(v.diaryId) : n.add(v.diaryId); return n })}
                              className="w-full flex items-start gap-3 px-3.5 py-3 text-left"
                              disabled={v.entries.length === 0}
                            >
                              {v.entries.length > 0 ? (
                                isOpen ? <ChevronDown className="w-3.5 h-3.5 text-stone-500 shrink-0 mt-0.5" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
                              ) : <span className="w-3.5 shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <p className="font-display font-semibold text-[15px] text-stone-800 truncate">{v.title}</p>
                                <p className="text-xs text-stone-400 mt-0.5">
                                  {v.entries.length === 0 ? 'nessun reportage pubblicabile ancora' : `${v.entries.length} reportage · ${fmtKm(v.totalKm)}`}
                                </p>
                                <div className="flex gap-1 mt-1.5">
                                  {SECTION_ICONS.map(([key, label, Icon]) => (
                                    <span
                                      key={key}
                                      title={label}
                                      className={`w-[18px] h-[18px] rounded-md flex items-center justify-center ${v.show[key] ? 'bg-forest-50 text-forest-600' : 'bg-stone-100 text-stone-300'}`}
                                    >
                                      <Icon className="w-[11px] h-[11px]" />
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </button>
                            {isOpen && v.entries.length > 0 && (
                              <div className="mx-3.5 mb-3 pl-3.5 border-l-[1.5px] border-stone-100">
                                {v.entries.map(e => (
                                  <div key={e.id} className="flex items-baseline gap-1.5 py-1">
                                    <span className="w-1 h-1 rounded-full bg-forest-600 shrink-0" />
                                    <span className="text-sm text-stone-700 whitespace-nowrap">{e.title}</span>
                                    <span className="flex-1 border-b border-dotted border-stone-300" />
                                    <span className="text-xs text-stone-400 whitespace-nowrap">{fmtDate(e.startTime)} · {fmtKm(e.distanceMeters)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <p className="text-xs text-stone-400 mb-6">
              Le cinque iconcine sono un riepilogo di cosa mostra ogni Diario — si accendono e spengono dal suo menù nell&apos;elenco Raccolte, non da qui.
            </p>
            </>
            )}

            <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-4 mb-6">
              <Kicker>Privacy</Kicker>
              <PublishPrivacyToggles />
              <p className="text-xs text-stone-400 mt-1.5">Vale per tutto quello che pubblichi, non una scelta per Raccolta.</p>
            </div>

            {/* Un solo link personale che resta sempre lo stesso — non uno per Raccolta: quello che
                pubblichi qui sotto con "Pubblica tutto" compare qui, l'utente lo trova sempre allo
                stesso indirizzo anche quando in futuro pubblica dell'altro. Componente riusato
                identico da /profilo/impostazioni — stessa identità, non una versione a parte.
                Sempre visibile, anche senza nulla di marcato: gestire il sito non dipende da
                questo — è il pulsante "Il tuo sito" di /raccolte che porta qui apposta. */}
            <div className="mb-6">
              <Kicker className="mb-2.5">Il tuo sito</Kicker>
              <p className="text-xs text-stone-400 mb-3">
                Un indirizzo fisso, sempre lo stesso: quello che pubblichi compare lì, insieme a tutto quello che pubblichi in futuro.
              </p>
              <SectionProfiloPubblico />
            </div>

            {collections.length > 0 && (
            <div className="rounded-2xl bg-white border border-stone-200 shadow-sm p-4">
              <Kicker>Pubblicazione</Kicker>
              <p className="text-xs text-stone-400 mb-3">
                {publishedCount === collections.length ? 'Tutte già online.' : `${publishedCount} già online, ${collections.length - publishedCount} da pubblicare.`}
              </p>
              {publishError && <p className="text-xs text-red-600 mb-2">{publishError}</p>}

              <button
                onClick={publishAll} disabled={publishing || publishedCount === collections.length}
                className="w-full flex items-center justify-center gap-2 bg-forest-600 hover:bg-forest-700 text-white text-sm font-semibold px-4 py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                {publishedCount === collections.length ? 'Pubblicate' : 'Pubblica tutto'}
              </button>

              {/* Link diretti per singola Raccolta — un dettaglio secondario per chi vuole
                  condividerne una sola invece del sito intero, non l'azione principale di questa
                  pagina (quella è "Il tuo sito" qui sopra). */}
              <div className="pt-3 mt-3 border-t border-stone-100">
                <p className="text-[11px] text-stone-400 mb-1.5">Oppure condividi una singola Raccolta:</p>
                <div className="flex flex-col divide-y divide-stone-100">
                  {collections.map(c => {
                    const token = shareTokenFor(c)
                    return (
                      <div key={c.id} className="flex items-center gap-2 py-1.5">
                        <span className="text-xs text-stone-500 flex-1 truncate">{c.title}</span>
                        {token ? (
                          <>
                            <a href={`/leggi/c/${token}`} target="_blank" rel="noopener noreferrer" title="Apri la raccolta online"
                              className="text-stone-300 hover:text-forest-600 p-1 -m-1 transition-colors">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <button onClick={() => copyLink(token, c.id)} title="Copia link" className="text-stone-300 hover:text-forest-600 p-1 -m-1 transition-colors">
                              <Copy className="w-3 h-3" />
                            </button>
                            {copiedId === c.id && <span className="text-[10px] text-forest-600 font-semibold">Copiato!</span>}
                          </>
                        ) : (
                          <span className="text-[11px] text-stone-300">non ancora pubblicata</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
