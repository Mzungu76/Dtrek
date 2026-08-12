// Home del sito pubblico del Diario.
//
// Prima era una pagina sola che conteneva tutto e si scorreva all'infinito: con dieci escursioni
// e cento foto diventava lunghissima e senza punti di riferimento. Ora è la home di un piccolo
// sito — copertina, numeri, indice — e ogni escursione ha una pagina propria
// (`/leggi/d/[token]/e/[n]`), raggiungibile dall'indice e con la sua navigazione.
//
// Resta un componente SERVER: nessuno stato, nessun JavaScript spedito al browser. Chi apre il
// link da una chat scarica del testo e delle immagini pigre, non un runtime.

import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Download, Route as RouteIcon, ChevronRight } from 'lucide-react'
import { withForcedDownload } from '@/lib/storageDownloadUrl'
import { formatDuration } from '@/lib/tcxParser'
import { hasNarrative, type PublicDiary } from '@/lib/sharePublicDiary'
import { SiteHeader, DtrekCallout, SiteFooter } from './SiteChrome'

export function DiaryPublicView({ diary, token }: { diary: PublicDiary; token: string }) {
  const show = diary.config.publicSections

  return (
    <div className="min-h-screen bg-stone-50">
      <SiteHeader token={token} diaryTitle={diary.config.title} current="home" />

      <main className="max-w-4xl mx-auto px-4 sm:px-5 py-6 sm:py-8 space-y-5">
        {/* Copertina */}
        <section className="relative rounded-3xl overflow-hidden shadow-sm border border-stone-200">
          <div className="relative p-8 sm:p-12 text-white"
            style={{ background: diary.config.coverUrl ? undefined : 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)' }}>
            {diary.config.coverUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={diary.config.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(8,24,14,0.74) 0%, rgba(8,24,14,0.5) 60%, rgba(8,24,14,0.62) 100%)' }} />
              </>
            )}
            <div className="relative">
              {diary.dateRangeLabel && (
                <p className="font-barlow font-bold text-[11px] tracking-[0.25em] uppercase text-terra-300 mb-3">
                  {diary.dateRangeLabel}
                </p>
              )}
              <h1 className="font-display text-3xl sm:text-5xl font-bold leading-tight">{diary.config.title}</h1>
              {diary.config.subtitle && <p className="mt-2 font-lora italic text-white/70 text-lg">{diary.config.subtitle}</p>}
              <p className="mt-5 text-sm text-white/60">di {diary.ownerName}</p>
            </div>
          </div>
        </section>

        {/* Numeri */}
        {show.statistiche && (
          <section className="grid grid-cols-3 gap-3">
            {[
              { value: String(diary.entries.length), label: diary.entries.length === 1 ? 'Escursione' : 'Escursioni' },
              { value: `${diary.totalKm.toFixed(0)} km`, label: 'Percorsi' },
              { value: `${Math.round(diary.totalElevationGain).toLocaleString('it')} m`, label: 'Dislivello +' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-stone-200 px-3 py-4 text-center shadow-sm">
                <div className="font-mono text-xl sm:text-2xl font-bold text-forest-800 leading-tight">{s.value}</div>
                <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mt-1">{s.label}</div>
              </div>
            ))}
          </section>
        )}

        {/* Indice raggruppato per anno: con più annate un elenco unico diventa un muro senza
            riferimenti temporali, ed è la prima cosa che si cerca in un diario. Il numero
            dell'escursione resta quello globale, così coincide con il PDF. */}
        {Array.from(
          diary.entries.reduce((m, e, i) => {
            const y = new Date(e.startTime).getFullYear()
            const list = m.get(y) ?? []
            list.push({ e, i })
            return m.set(y, list)
          }, new Map<number, { e: typeof diary.entries[number]; i: number }[]>()),
        ).sort((a, b) => b[0] - a[0]).map(([year, items]) => (
        <section key={year} className="space-y-3">
          <h2 className="flex items-baseline gap-3 px-1">
            <span className="font-display text-2xl font-bold text-forest-900">{year}</span>
            <span className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-stone-400">
              {items.length} {items.length === 1 ? 'escursione' : 'escursioni'} ·{' '}
              {(items.reduce((s, x) => s + x.e.distanceMeters, 0) / 1000).toFixed(0)} km
            </span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {items.map(({ e, i }) => {
              const cover = show.foto ? e.photos[0] : undefined
              return (
                <a key={e.id} href={`/leggi/d/${token}/e/${i + 1}`}
                  className="group bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden hover:shadow-md hover:border-stone-300 transition flex flex-col">
                  {cover
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={cover.url} alt="" loading="lazy" decoding="async"
                        className="w-full aspect-[16/9] object-cover bg-stone-100" />
                    : <div className="w-full aspect-[16/9] bg-gradient-to-br from-forest-800 to-forest-950" />}
                  <div className="p-4 flex-1 flex flex-col">
                    <p className="font-barlow font-bold text-[9px] tracking-[0.2em] uppercase text-terra-500">
                      #{String(i + 1).padStart(2, '0')} · {format(new Date(e.startTime), 'MMMM yyyy', { locale: it })}
                    </p>
                    <h3 className="font-display text-lg font-bold text-forest-900 leading-tight mt-1 group-hover:text-forest-700 transition">
                      {e.title}
                    </h3>
                    <p className="font-mono text-xs text-stone-500 mt-2">
                      {(e.distanceMeters / 1000).toFixed(1)} km · {Math.round(e.elevationGain)} m D+
                      {e.totalTimeSeconds > 0 && ` · ${formatDuration(e.totalTimeSeconds)}`}
                    </p>
                    <p className="mt-auto pt-3 flex items-center gap-1 text-xs font-semibold text-forest-700">
                      {hasNarrative(e.content) && show.racconto ? 'Leggi il racconto' : 'Vedi l’escursione'}
                      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </p>
                  </div>
                </a>
              )
            })}
          </div>
        </section>
        ))}
        {diary.entries.length === 0 && (
          <p className="text-sm text-stone-400 text-center py-8">Nessuna escursione pubblicata.</p>
        )}

        {/* Il PDF è un allegato: il sito si legge per intero senza scaricarlo */}
        {diary.pdfUrl && (
          <a href={withForcedDownload(diary.pdfUrl, 'diario-dtrek.pdf')} download
            className="flex items-center justify-center gap-2 bg-white border border-stone-200 hover:bg-stone-50 transition text-stone-600 font-display font-bold text-sm rounded-2xl py-3.5 shadow-sm">
            <Download className="w-4 h-4" /> Scarica il diario in PDF
          </a>
        )}

        <DtrekCallout />
        <SiteFooter />
      </main>
    </div>
  )
}

/** Riepilogo compatto usato in testa alla pagina di una escursione. */
export function EntryQuickStats({ km, dplus, seconds }: { km: number; dplus: number; seconds: number }) {
  return (
    <p className="font-mono text-xs text-stone-500 flex items-center gap-1.5">
      <RouteIcon className="w-3.5 h-3.5 text-stone-300" />
      {km.toFixed(1)} km · {Math.round(dplus)} m D+{seconds > 0 && ` · ${formatDuration(seconds)}`}
    </p>
  )
}
