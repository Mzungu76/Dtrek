import type { RoutePhoto } from '@/lib/activityPhotos'
import { TornFrame, TornBadge, tornVariant } from '@/components/TornFrame'
import { TACCUINO_INK } from '@/lib/taccuinoTokens'

export function PhotoGallery({ photos, onPhotoClick }: { photos: RoutePhoto[]; onPhotoClick: (photo: RoutePhoto) => void }) {
  return (
    <section className="mt-8 print:hidden">
      <h3 className="font-display font-bold uppercase tracking-[2px] text-sm text-stone-500 mb-4">
        Le tue foto
      </h3>
      {/* Padding extra sopra/ai lati (30px/8px) — spazio per il nastro e l'ombra "sollevata" che
          sporgono oltre il riquadro 144x112 di ogni .torn-frame (Taccuino Botanico, calibrato in
          un mockup dedicato prima di questo porting). */}
      <div className="flex gap-6 overflow-x-auto pt-8 px-2 pb-4">
        {photos.map((ph, i) => (
          <button key={ph.id} onClick={() => onPhotoClick(ph)} className="shrink-0 w-36 text-center group">
            {/* DTREK-AUDIT.md P3 #35 — striscia di miniature, il tap apre la lightbox in piena risoluzione (ph.url) */}
            <TornFrame size="photo" variant={tornVariant(ph.id)} badge={<TornBadge>{i + 1}</TornBadge>}>
              <img src={ph.thumbUrl ?? ph.url} alt={ph.caption}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            </TornFrame>
            {ph.caption && (
              <p className="mt-2.5 font-body text-[11px] italic leading-snug" style={{ color: TACCUINO_INK.handMuted }}>
                {i + 1}. {ph.caption}
              </p>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}
