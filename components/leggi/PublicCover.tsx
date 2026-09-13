// Copertina a piena pagina per l'home di un Diario/Raccolta/Volume pubblicato — stessa identità
// visiva della copertina a schermo intero di RouteHub/TopOverlay nell'app privata (Guida,
// Resoconto, /diario): foto (o gradiente) a bordo pagina, sfumatura scura per la leggibilità,
// pillole di statistica in alto, titolo grande in basso. Qui riprodotta in puro HTML/CSS — nessuno
// stato, nessun JavaScript spedito al browser, coerente col resto del sito pubblico.
export function PublicCover({ coverUrl, eyebrow, title, subtitle, ownerName, pills }: {
  coverUrl?: string | null
  /** Riga sottile sopra il titolo — intervallo di date, "Una Raccolta di N Diari", ecc. */
  eyebrow?: string | null
  title: string
  subtitle?: string | null
  ownerName?: string | null
  pills?: { value: string; label: string }[]
}) {
  return (
    <section className="relative w-full h-[52vh] min-h-[360px] max-h-[560px] overflow-hidden">
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)' }} />
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(6,16,10,0.6) 0%, rgba(6,16,10,0.15) 32%, rgba(6,16,10,0.8) 100%)' }} />

      {pills && pills.length > 0 && (
        <div className="absolute inset-x-0 top-0 px-4 sm:px-6 pt-4">
          <div className="max-w-4xl mx-auto flex flex-wrap gap-1.5">
            {pills.map(p => (
              <span key={p.label} className="bg-white text-stone-700 text-[11px] font-semibold px-2.5 py-1.5 rounded-full shadow-sm">
                {p.value} <span className="text-stone-400 font-normal">{p.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 px-4 sm:px-6 pb-6 sm:pb-8">
        <div className="max-w-4xl mx-auto">
          {eyebrow && (
            <p className="font-barlow font-bold text-[11px] tracking-[0.25em] uppercase text-terra-300 mb-2">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-3xl sm:text-5xl font-black uppercase tracking-tight text-white leading-[1.05]"
            style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 font-lora italic text-white/80 text-base sm:text-lg" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>
              {subtitle}
            </p>
          )}
          {ownerName && <p className="mt-4 text-xs sm:text-sm text-white/70">di {ownerName}</p>}
        </div>
      </div>
    </section>
  )
}
