import type { RoutePhoto } from '@/lib/activityPhotos'

export function PrintPhotoGrid({ photos }: { photos: RoutePhoto[] }) {
  return (
    <section className="hidden print:block mt-6 pt-4 border-t border-stone-200">
      <h3 className="font-display font-bold uppercase tracking-[2px] text-sm text-stone-500 mb-4">
        Documentazione fotografica
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
        {photos.map((ph, i) => (
          <div key={ph.id} style={{ breakInside: 'avoid' }}>
            <div style={{ position: 'relative' }}>
              <img src={ph.url} alt={ph.caption}
                style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 8 }} />
              <span style={{
                position: 'absolute', top: 6, left: 6,
                width: 18, height: 18, background: '#f59e0b', color: 'white',
                borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 8, fontWeight: 'bold',
                border: '2px solid white',
              }}>
                {i + 1}
              </span>
            </div>
            {ph.caption && (
              <p style={{ fontSize: 9, color: '#78716c', fontStyle: 'italic',
                marginTop: 4, textAlign: 'center', lineHeight: 1.4 }}>
                {i + 1}. {ph.caption}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
