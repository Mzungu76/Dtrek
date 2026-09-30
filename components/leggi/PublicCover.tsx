import { ChevronLeft, ChevronRight } from 'lucide-react'
import SafeImg from '@/components/ui/SafeImg'

// Copertina a piena pagina per l'home di un Diario/Raccolta/Volume pubblicato — stessa identità
// visiva della copertina a schermo intero di RouteHub/TopOverlay nell'app privata (Guida,
// Resoconto, /diario): foto (o gradiente) a bordo pagina, sfumatura scura per la leggibilità,
// pillole di statistica in alto, titolo grande in basso. Qui riprodotta in puro HTML/CSS — nessuno
// stato, nessun JavaScript spedito al browser, coerente col resto del sito pubblico.
//
// `prevHref`/`nextHref` sono frecce, non un vero swipe: un vero trascinamento col dito
// richiederebbe JavaScript lato client, che queste pagine non spediscono di proposito (si aprono
// da un link, spesso da telefono con poco segnale).
export function PublicCover({ coverUrl, eyebrow, title, subtitle, preface, ownerName, pills, prevHref, nextHref, cta, bottomInset = 0 }: {
  coverUrl?: string | null
  /** Riga sottile sopra il titolo — intervallo di date, "Una Raccolta di N Diari", ecc. */
  eyebrow?: string | null
  title: string
  subtitle?: string | null
  /** Prefazione scritta dall'autore (solo la Raccolta ne ha una) — testo libero, breve. */
  preface?: string | null
  ownerName?: string | null
  pills?: { value: string; label: string }[]
  /** Freccia verso l'elemento precedente/successivo dello stesso tipo (un'altra Raccolta dello
   *  stesso autore, un altro Diario della stessa Raccolta) — assente ai due estremi. */
  prevHref?: string | null
  nextHref?: string | null
  /** Pulsante principale in fondo alla copertina — "Vedi la raccolta", "Vedi Reportage". */
  cta?: { href: string; label: string }
  /** Px da sottrarre in fondo — la copertina è alta "tutto lo schermo meno la testata", ma se sotto
   *  compare anche la BottomGalleryStrip (fixed, sempre sopra) il pulsante finirebbe nascosto
   *  dietro di lei senza questo spazio riservato (components/leggi/BottomGalleryStrip.tsx). */
  bottomInset?: number
}) {
  return (
    <section className="relative w-full overflow-hidden" style={{ height: `calc(100vh - ${56 + bottomInset}px)`, minHeight: 480 - bottomInset }}>
      {coverUrl ? (
        <SafeImg variant="cover" src={coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)' }} />
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(6,16,10,0.62) 0%, rgba(6,16,10,0.18) 32%, rgba(6,16,10,0.85) 100%)' }} />

      {pills && pills.length > 0 && (
        <div className="absolute inset-x-0 top-0 px-4 sm:px-6 lg:px-10 xl:px-14 pt-4 lg:pt-8">
          <div className="max-w-4xl lg:max-w-6xl xl:max-w-[1600px] mx-auto flex flex-wrap gap-1.5">
            {pills.map(p => (
              <span key={p.label} className="bg-white text-stone-700 text-[11px] font-semibold px-2.5 py-1.5 rounded-full shadow-sm">
                {p.value} <span className="text-stone-400 font-normal">{p.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {prevHref && (
        <a href={prevHref} aria-label="Precedente"
          className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-black/35 hover:bg-black/50 backdrop-blur-sm text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </a>
      )}
      {nextHref && (
        <a href={nextHref} aria-label="Successivo"
          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-black/35 hover:bg-black/50 backdrop-blur-sm text-white transition-colors">
          <ChevronRight className="w-5 h-5" />
        </a>
      )}

      <div className="absolute inset-x-0 bottom-0 px-4 sm:px-6 lg:px-10 xl:px-14 pb-6 sm:pb-8 lg:pb-12">
        <div className="max-w-4xl lg:max-w-6xl xl:max-w-[1600px] mx-auto">
          {eyebrow && (
            <p className="font-barlow font-bold text-[11px] lg:text-xs tracking-[0.25em] lg:tracking-[0.3em] uppercase text-terra-300 mb-2 lg:mb-3">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl xl:text-7xl font-black uppercase tracking-tight text-white leading-[1.05] lg:leading-[1.02]"
            style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 font-lora italic text-white/80 text-base sm:text-lg" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
              {subtitle}
            </p>
          )}
          {ownerName && <p className="mt-4 text-xs sm:text-sm text-white/70">di {ownerName}</p>}
          {preface && (
            <p className="mt-4 font-lora text-[15px] leading-relaxed text-white/85 max-w-xl line-clamp-3 whitespace-pre-line">
              {preface}
            </p>
          )}
          {cta && (
            <a href={cta.href}
              className="inline-block mt-6 bg-white text-forest-900 font-display font-bold text-sm rounded-full px-7 py-3 hover:bg-stone-100 transition">
              {cta.label}
            </a>
          )}
        </div>
      </div>
    </section>
  )
}
