'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { BookOpen, Download, Route as RouteIcon } from 'lucide-react'
import PdfViewer from '@/app/components/PdfViewer'
import type { PublicDiary } from '@/lib/sharePublicDiary'

// Il lettore a pagine (PdfViewer) rasterizza ogni pagina via pdfjs-dist appena montato: costa
// banda anche a un visitatore che non ha alcuna intenzione di sfogliare il PDF, solo passato di
// qui da un link condiviso. Montarlo solo al clic — invece che sempre, nascosto via CSS — evita
// quel download finché non è davvero richiesto.
export function DiaryPublicView({ diary, title }: { diary: PublicDiary; title: string }) {
  const [showReader, setShowReader] = useState(false)

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-gradient-to-br from-forest-800 to-forest-900 text-white">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-bold text-lg">
            <span className="text-forest-300">▲</span> DTrek
          </div>
          <a href="/" className="text-xs font-semibold bg-white/15 hover:bg-white/25 transition rounded-full px-4 py-1.5">
            Apri l&apos;app
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8 space-y-6">
        {/* Cover */}
        <section className="relative rounded-3xl overflow-hidden shadow-sm border border-stone-200">
          <div
            className="relative p-8 sm:p-10 text-white"
            style={{
              background: diary.config.coverUrl
                ? undefined
                : 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)',
            }}
          >
            {diary.config.coverUrl && (
              <>
                <img src={diary.config.coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(8,24,14,0.72) 0%, rgba(8,24,14,0.5) 60%, rgba(8,24,14,0.6) 100%)' }} />
              </>
            )}
            <div className="relative">
              {diary.dateRangeLabel && (
                <p className="font-barlow font-bold text-[11px] tracking-[0.25em] uppercase text-terra-300 mb-3">
                  {diary.dateRangeLabel}
                </p>
              )}
              <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight">{diary.config.title}</h1>
              {diary.config.subtitle && <p className="mt-2 font-lora italic text-white/70">{diary.config.subtitle}</p>}
              <p className="mt-4 text-sm text-white/60">di {diary.ownerName}</p>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-3 gap-3">
          {[
            { value: String(diary.entries.length), label: diary.entries.length === 1 ? 'Escursione' : 'Escursioni' },
            { value: `${diary.totalKm.toFixed(0)} km`, label: 'Percorsi' },
            { value: `${Math.round(diary.totalElevationGain).toLocaleString('it')} m`, label: 'Dislivello +' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-stone-200 px-3 py-3.5 text-center shadow-sm">
              <div className="font-mono text-xl font-bold text-stone-800 leading-tight">{s.value}</div>
              <div className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mt-0.5">{s.label}</div>
            </div>
          ))}
        </section>

        {/* Reader CTA */}
        <section className="bg-white rounded-3xl border border-stone-200 shadow-sm p-5 sm:p-6 space-y-3">
          <button
            onClick={() => setShowReader(true)}
            className="w-full flex items-center justify-center gap-2 bg-forest-600 hover:bg-forest-700 transition text-white font-display font-bold text-sm rounded-2xl py-3"
          >
            <BookOpen className="w-4 h-4" /> Sfoglia il diario
          </button>
          <a href={diary.pdfUrl} target="_blank" rel="noopener noreferrer" download
            className="w-full flex items-center justify-center gap-2 border border-stone-200 hover:bg-stone-50 transition text-stone-600 font-display font-bold text-sm rounded-2xl py-3"
          >
            <Download className="w-4 h-4" /> Scarica il PDF
          </a>
        </section>

        {/* Index */}
        {diary.entries.length > 0 && (
          <section className="bg-white rounded-3xl border border-stone-200 shadow-sm p-5 sm:p-6">
            <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Le escursioni</h2>
            <ul className="divide-y divide-stone-100">
              {diary.entries.map((e, i) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <span className="font-mono text-xs text-stone-300 w-6 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-stone-700 truncate">{e.title}</p>
                    <p className="text-xs text-stone-400">{format(new Date(e.startTime), 'd MMMM yyyy', { locale: it })}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1 text-xs text-stone-500">
                    <RouteIcon className="w-3 h-3 text-stone-300" />
                    {(e.distanceMeters / 1000).toFixed(1)} km
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* CTA */}
        <section className="bg-gradient-to-br from-forest-700 to-forest-900 rounded-3xl p-7 text-center text-white">
          <p className="font-display text-lg font-bold">Tieni il tuo diario di escursioni con DTrek</p>
          <p className="text-sm text-white/70 mt-1.5 max-w-md mx-auto">
            Mappe 3D, profili altimetrici, TrailScore e un diario che ricorda ogni percorso.
          </p>
          <a href="/" className="inline-block mt-4 bg-white text-forest-800 font-display font-semibold text-sm rounded-full px-6 py-2.5 hover:bg-stone-50 transition">
            Scopri DTrek
          </a>
        </section>

        <p className="text-center text-[11px] text-stone-400 pb-4">Condiviso tramite DTrek</p>
      </main>

      {showReader && (
        <div className="fixed inset-0 z-50">
          <button onClick={() => setShowReader(false)}
            className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-lg">
            ✕
          </button>
          <PdfViewer pdfUrl={diary.pdfUrl} title={title} />
        </div>
      )}
    </div>
  )
}
