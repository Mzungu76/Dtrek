import type { RoutePhoto } from '@/lib/activityPhotos'

export function PhotoGallery({ photos, onPhotoClick }: { photos: RoutePhoto[]; onPhotoClick: (photo: RoutePhoto) => void }) {
  return (
    <section className="mt-8 print:hidden">
      <h3 className="font-display font-bold uppercase tracking-[2px] text-sm text-stone-500 mb-4">
        Le tue foto
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-3">
        {photos.map((ph, i) => (
          <button key={ph.id} onClick={() => onPhotoClick(ph)}
            className="shrink-0 w-36 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
            <div className="relative">
              <img src={ph.url} alt={ph.caption}
                className="w-36 h-28 object-cover group-hover:scale-105 transition-transform duration-300" />
              <span className="absolute top-1.5 left-1.5 w-5 h-5 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center font-display">
                {i + 1}
              </span>
            </div>
            {ph.caption && (
              <p className="px-2 py-1.5 font-body text-[10px] italic text-stone-500 leading-snug bg-white">
                {i + 1}. {ph.caption}
              </p>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}
