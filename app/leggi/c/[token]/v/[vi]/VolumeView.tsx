// Indice delle escursioni di UN volume della Raccolta — stessa struttura della home del Diario
// (app/leggi/d/[token]/DiaryPublicView.tsx), qui filtrata a un solo volume invece di essere la
// home stessa. docs/raccolte-pubblicazione-piano.md, Fase 3e.
//
// Direzione Taccuino Botanico (docs/siti-pubblici-taccuino-piano.md, Fase 5): stessa carta e
// rilegatura di DiaryPublicView.tsx. Fase 8: anche la stessa copertina a piena pagina che si
// "apre" e le stesse righe compatte con icona del Sommario — un volume di una Raccolta è
// concettualmente un Diario, la stessa fedeltà al mockup approvato vale qui. Vedi il commento in
// testa a DiaryPublicView.tsx per il perché la copertina resta nel flusso normale del documento
// invece di un overlay `absolute`/`fixed` come nel mockup originale.
//
// Componente separato da page.tsx (non un export in più lì): Next.js rifiuta in build qualunque
// export da un file `page.tsx` che non sia uno dei campi che riconosce (default, generateMetadata,
// dynamic, ecc.) — stesso motivo per cui DiaryPublicView vive nel proprio file.
import { useId } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { ChevronRight } from 'lucide-react'
import type { PublicCollection, PublicCollectionVolume } from '@/lib/sharePublicCollection'
import { hasNarrative } from '@/lib/sharePublicDiary'
import { formatDuration } from '@/lib/tcxParser'
import { HandDrawnFrame } from '@/lib/taccuinoTokens'
import { SiteHeader, DtrekCallout, SiteFooter, taccuinoPaperBackgroundStyle, TaccuinoSpineShadow } from '../../SiteChrome'
import { PublicPdfExport } from '@/app/leggi/d/[token]/PublicPdfExport'
import { RouteSketch } from '@/app/leggi/d/[token]/RouteSketch'

const COVER_GRADIENT = 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)'

export function VolumeView({ collection, volume, idx, token }: {
  collection: PublicCollection
  volume: PublicCollectionVolume
  idx: number
  token: string
}) {
  const show = volume.show
  const openId = useId()

  const stats: { value: string; label: string }[] = []
  if (volume.entries.length) stats.push({ value: String(volume.entries.length), label: volume.entries.length === 1 ? 'Escursione' : 'Escursioni' })
  if (volume.totalKm) stats.push({ value: volume.totalKm.toFixed(0), label: 'Km percorsi' })
  if (volume.totalElevationGain) stats.push({ value: Math.round(volume.totalElevationGain).toLocaleString('it'), label: 'M dislivello' })

  return (
    <div className="min-h-screen relative" style={taccuinoPaperBackgroundStyle()}>
      <input type="checkbox" id={openId} className="peer hidden" />

      {/* COPERTINA — vedi DiaryPublicView.tsx per il perché resta nel flusso normale invece di un
          overlay a piena pagina. */}
      <label htmlFor={openId} aria-hidden="true"
        className="block h-[100dvh] max-h-[100dvh] origin-top overflow-hidden cursor-pointer relative text-white transition-[max-height,opacity] duration-700 ease-[cubic-bezier(.5,0,.2,1)] peer-checked:max-h-0 peer-checked:opacity-0 peer-checked:pointer-events-none peer-checked:duration-500"
        style={{ background: volume.coverUrl ? undefined : COVER_GRADIENT }}>
        {volume.coverUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={volume.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(8,24,14,0.74) 0%, rgba(8,24,14,0.5) 60%, rgba(8,24,14,0.62) 100%)' }} />
          </>
        ) : (
          <>
            <svg aria-hidden="true" className="absolute inset-0 w-full h-full opacity-[0.045]" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
              <path d="M0,640 Q98,590 196,605 Q294,620 390,570 L390,844 L0,844 Z" fill="white" opacity=".6" />
              <path d="M0,565 Q88,515 186,530 Q284,545 390,498" stroke="white" strokeWidth=".8" fill="none" />
              <path d="M0,490 Q98,448 196,462 Q294,476 390,428" stroke="white" strokeWidth=".8" fill="none" />
              <path d="M0,415 Q108,375 196,388 Q294,401 390,355" stroke="white" strokeWidth=".7" fill="none" />
              <path d="M0,340 Q108,300 196,313 Q294,326 390,280" stroke="white" strokeWidth=".6" fill="none" />
            </svg>
            <svg aria-hidden="true" className="absolute bottom-0 left-0 w-full opacity-[0.09]" viewBox="0 0 390 240" preserveAspectRatio="none">
              <path d="M0,240 L34,158 L64,190 L110,92 L150,132 L189,42 L221,92 L255,52 L292,96 L324,60 L358,88 L390,65 L390,240 Z" fill="white" />
            </svg>
            <div aria-hidden="true" className="absolute top-16 right-3 font-display font-bold leading-none select-none text-[150px] text-white/[0.025]">{idx + 1}</div>
          </>
        )}

        <div className="relative h-full flex flex-col p-6 sm:p-10">
          <div className="flex items-center justify-between">
            <span className="font-barlow font-black text-sm tracking-[0.3em] uppercase" style={{ color: '#e08d3c' }}>DTrek</span>
            <span className="text-[8px] tracking-[0.18em] uppercase text-white/30">{collection.title}</span>
          </div>

          <div className="mt-auto pr-3">
            <p className="font-barlow font-bold text-[11px] tracking-[0.26em] uppercase mb-3.5" style={{ color: '#e08d3c' }}>
              Volume {idx + 1} di {collection.volumes.length}{volume.dateRangeLabel ? ` · ${volume.dateRangeLabel}` : ''}
            </p>
            <h1 className="font-display font-bold text-4xl sm:text-5xl leading-[1.06] tracking-tight mb-4">{volume.title}</h1>
            <div className="w-12 h-0.5 mb-4" style={{ background: '#e08d3c' }} />
            {volume.subtitle && <p className="font-lora italic text-white/60 text-sm mb-6">{volume.subtitle}</p>}
            {stats.length > 0 && (
              <div className="flex border-t border-white/10 pt-4">
                {stats.map((s, i) => (
                  <div key={s.label} className={`flex-1 ${i > 0 ? 'border-l border-white/10 pl-4' : ''} ${i < stats.length - 1 ? 'pr-4' : ''}`}>
                    <p className="font-mono text-xl text-white leading-none">{s.value}</p>
                    <p className="text-[8px] tracking-[0.2em] uppercase text-white/40 mt-1.5">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-center animate-pulse pt-10 pb-2">
            <span className="font-barlow font-bold text-[10.5px] tracking-[0.2em] uppercase text-white/60">Tocca per aprire</span>
          </div>
          <div className="flex items-end justify-between">
            <p className="text-[9px] tracking-[0.24em] uppercase text-white/40">{collection.ownerName}</p>
            <p className="font-lora italic text-[9px] text-white/20">Fatto con DTrek</p>
          </div>
        </div>
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: '#e08d3c' }} />
        <div className="absolute bottom-0 left-0 right-0 h-[2.5px]" style={{ background: 'linear-gradient(90deg,#e08d3c 0%,#d97220 55%,transparent 100%)' }} />
      </label>

      <TaccuinoSpineShadow />
      <SiteHeader token={token} collectionTitle={collection.title} current="volume" />

      <div className="hidden peer-checked:flex justify-end max-w-4xl mx-auto px-4 sm:px-5 pl-[calc(1rem+34px)] sm:pl-[calc(1.25rem+34px)] pt-3">
        <label htmlFor={openId} className="inline-flex items-center gap-1.5 bg-[#2E2A22] text-white text-xs font-bold rounded-full px-4 py-2 cursor-pointer shadow-md hover:bg-[#232019] transition">
          ↩ Chiudi il taccuino
        </label>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-5 py-6 sm:py-8 pl-[calc(1rem+34px)] sm:pl-[calc(1.25rem+34px)] space-y-5">
        <a href={`/leggi/c/${token}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#7A6F52] hover:text-[#193b20] transition">
          ← {collection.title}
        </a>

        <div>
          <p className="font-barlow font-bold text-[9.5px] tracking-[0.2em] uppercase text-[#95886A] mb-0.5">Sommario · DTrek</p>
          <h2 className="font-hand text-[32px] leading-none text-[#2E2A22]/[0.82]" style={{ mixBlendMode: 'multiply' }}>
            {volume.title}
          </h2>
        </div>

        {Array.from(
          volume.entries.reduce((m, e, i) => {
            const y = new Date(e.startTime).getFullYear()
            const list = m.get(y) ?? []
            list.push({ e, i })
            return m.set(y, list)
          }, new Map<number, { e: typeof volume.entries[number]; i: number }[]>()),
        ).sort((a, b) => b[0] - a[0]).map(([year, items]) => (
        <section key={year} className="space-y-2">
          <h2 className="flex items-baseline gap-3 px-1">
            <span className="font-display text-2xl font-bold text-[#2E2A22]">{year}</span>
            <span className="font-barlow font-bold text-[10px] tracking-[0.2em] uppercase text-[#95886A]">
              {items.length} {items.length === 1 ? 'escursione' : 'escursioni'} ·{' '}
              {(items.reduce((s, x) => s + x.e.distanceMeters, 0) / 1000).toFixed(0)} km
            </span>
          </h2>
          <div>
            {items.map(({ e, i }) => {
              const cover = show.foto ? e.photos[0] : undefined
              const hasStory = hasNarrative(e.content) && show.racconto
              return (
                <a key={e.id} href={`/leggi/c/${token}/v/${idx + 1}/e/${i + 1}`}
                  className="group flex items-center gap-3 px-2 py-2 rounded-xl transition hover:bg-[#EBE0C8]/50"
                  style={{ background: hasStory ? 'rgba(192,96,61,0.07)' : 'transparent' }}>
                  <div className="relative w-[60px] h-[60px] rounded-xl shrink-0 bg-[#EBE0C8] overflow-hidden">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover.url} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
                    ) : e.polyline && e.polyline.length > 1 ? (
                      <RouteSketch polyline={e.polyline} color="#C0603D" className="bg-transparent" width={60} height={60} showMarkers={false} animated />
                    ) : null}
                    <HandDrawnFrame stroke="#D9C9A8" rx={9} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-bold text-[13px] text-[#2E2A22] leading-tight truncate group-hover:text-[#193b20] transition">
                      {e.title}
                    </p>
                    <p className="font-mono text-[10px] text-[#95886A] mt-1">
                      {(e.distanceMeters / 1000).toFixed(1)} km · {Math.round(e.elevationGain)} m D+
                      {e.totalTimeSeconds > 0 && ` · ${formatDuration(e.totalTimeSeconds)}`}
                    </p>
                    <p className="text-[9px] font-barlow font-bold tracking-[0.15em] uppercase text-[#C0603D] mt-0.5">
                      #{String(i + 1).padStart(2, '0')} · {format(new Date(e.startTime), 'MMMM yyyy', { locale: it })}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#C4BEAD] group-hover:text-[#C0603D] group-hover:translate-x-0.5 transition shrink-0" />
                </a>
              )
            })}
          </div>
        </section>
        ))}
        {volume.entries.length === 0 && (
          <p className="text-sm text-[#95886A] text-center py-8">Nessuna escursione pubblicata in questo volume.</p>
        )}

        <PublicPdfExport diary={{
          entries: volume.entries, ownerName: collection.ownerName, title: volume.title,
          subtitle: volume.subtitle, coverUrl: volume.coverUrl, dateRangeLabel: volume.dateRangeLabel,
        }} />

        <DtrekCallout />
        <SiteFooter />
      </main>
    </div>
  )
}
