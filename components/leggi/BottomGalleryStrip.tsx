// Galleria di miniature fissa in fondo allo schermo — stessa collocazione e stesso linguaggio
// visivo di BottomGallery nell'app privata (components/routehub/BottomGallery.tsx): striscia
// orizzontale di quadrati con didascalia in basso, sempre raggiungibile mentre si scorre la
// pagina. Qui è solo `<a>` e scroll-snap CSS: nessun drag, nessuno stato, nessun JavaScript.
export function BottomGalleryStrip({ items }: {
  items: { href: string; title: string; imageUrl?: string | null; badge?: string }[]
}) {
  if (items.length === 0) return null

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-forest-950/92 backdrop-blur-md border-t border-black/25 pt-2.5"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}>
      <div className="flex gap-2.5 overflow-x-auto px-4" style={{ scrollSnapType: 'x proximity' }}>
        {items.map(it => (
          <a key={it.href} href={it.href} style={{ scrollSnapAlign: 'start' }}
            className="shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden relative border-[1.5px] border-white/25 hover:border-white/50 transition-colors">
            {it.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.imageUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-forest-800 to-forest-950" />
            )}
            {it.badge && (
              <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-white/90 text-stone-800 text-[8px] font-bold shadow-sm leading-none">
                {it.badge}
              </span>
            )}
            <div className="absolute bottom-0 inset-x-0 px-1.5 pb-1 pt-5 bg-gradient-to-t from-black/80 to-transparent">
              <span className="block text-[9px] sm:text-[10px] font-bold text-white truncate leading-tight">{it.title}</span>
            </div>
          </a>
        ))}
      </div>
    </nav>
  )
}

/** Altezza approssimativa della barra (icona 64/80px + padding + safe-area) da lasciare libera in
 *  fondo alla pagina che la monta, così l'ultimo contenuto non ci finisce dietro. */
export const BOTTOM_GALLERY_SPACER_CLASS = 'pb-24 sm:pb-28'
