import type { StoredActivity } from '@/lib/blobStore'
import type { RoutePhoto } from '@/lib/activityPhotos'
import type { Section } from '@/lib/reportStore'
import { formatDuration } from '@/lib/tcxParser'
import { slotFor } from './sectionPhotoSlot'

// Off-screen layout captured by html2pdf when publishing (see the "Genera e pubblica"
// handler in ReportReader) — kept structurally separate from the on-screen article so
// the PDF's inline styles/fixed pixel widths don't have to also serve the responsive view.
export function HiddenPdfRoot({ activity, heroPhoto, dateStr, sections, photos }: {
  activity: StoredActivity; heroPhoto: RoutePhoto | null; dateStr: string
  sections: Section[]; photos: RoutePhoto[]
}) {
  return (
    <div id="resoconto-print-root"
      style={{ position: 'fixed', left: '-9999px', top: 0, width: 794, background: 'white', fontFamily: 'Georgia, serif' }}>
      {/* Hero */}
      <div className="pdf-block" style={{ position: 'relative', width: '100%', height: 220, overflow: 'hidden', marginBottom: 0 }}>
        {heroPhoto
          ? <img src={heroPhoto.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#193b20,#277134)' }} />
        }
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(31,22,15,0.7) 0%, transparent 60%)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px 32px' }}>
          <h1 style={{ fontFamily: 'Arial Black, sans-serif', fontSize: 28, fontWeight: 900, color: 'white', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>
            {activity.title ?? activity.notes ?? 'Escursione'}
          </h1>
          {dateStr && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', margin: '4px 0 0', fontStyle: 'italic' }}>{dateStr}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {[
              `${(activity.distanceMeters / 1000).toFixed(1)} km`,
              `${activity.elevationGain.toFixed(0)} m D+`,
              formatDuration(activity.totalTimeSeconds),
            ].map(v => (
              <span key={v} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.2)', color: 'white', fontWeight: 600, fontFamily: 'Arial, sans-serif' }}>{v}</span>
            ))}
          </div>
        </div>
      </div>
      {/* Sections */}
      <div style={{ padding: '32px 32px 0' }}>
        {sections.map((section, i) => {
          const slot = slotFor(section.title, i)
          const sectionPhoto = photos[slot]
          return (
            <div key={i} className="pdf-block" style={{ marginBottom: 24 }}>
              <div style={{ background: ['#2d6a4f','#40916c','#74c69d','#b7e4c7','#d8f3dc'][i % 5], padding: '6px 16px', borderRadius: '6px 6px 0 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', fontFamily: 'Arial, sans-serif', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>{String(i+1).padStart(2,'0')}</span>
                <span style={{ fontSize: 14, fontFamily: 'Arial Black, sans-serif', fontWeight: 900, color: 'white', textTransform: 'uppercase', letterSpacing: 1 }}>{section.title}</span>
              </div>
              <div style={{ padding: '12px 16px', background: '#fff', border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 6px 6px' }}>
                {sectionPhoto && slot > 0 && (
                  <div style={{ float: 'right', marginLeft: 12, marginBottom: 8, width: 120 }}>
                    <div style={{ position: 'relative' }}>
                      <img src={sectionPhoto.url} alt={sectionPhoto.caption} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
                      <span style={{ position: 'absolute', top: 4, left: 4, width: 16, height: 16, background: '#f59e0b', color: 'white', borderRadius: '50%', fontSize: 8, fontWeight: 'bold', fontFamily: 'Arial, sans-serif', textAlign: 'center', lineHeight: '16px', display: 'block', boxSizing: 'border-box' }}>{slot+1}</span>
                    </div>
                    <p style={{ fontSize: 8, color: '#78716c', textAlign: 'center', marginTop: 3, fontStyle: 'italic' }}>{sectionPhoto.caption}</p>
                  </div>
                )}
                {section.body.split(/\n\n+/).map((p, j) => (
                  <p key={j} style={{ fontSize: 11, lineHeight: 1.7, color: '#374151', margin: '0 0 8px' }}>{p.replace(/\[curiosita\]|\[\/curiosita\]/g, '').trim()}</p>
                ))}
              </div>
            </div>
          )
        })}
        {/* Photo grid */}
        {photos.length > 0 && (
          <div className="pdf-block" style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, marginTop: 8 }}>
            <h3 style={{ fontFamily: 'Arial, sans-serif', fontSize: 9, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#9ca3af', marginBottom: 12 }}>Documentazione fotografica</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {photos.map((ph, i) => (
                <div key={ph.id} className="pdf-block">
                  <div style={{ position: 'relative' }}>
                    <img src={ph.url} alt={ph.caption} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 6 }} />
                    <span style={{ position: 'absolute', top: 4, left: 4, width: 16, height: 16, background: '#f59e0b', color: 'white', borderRadius: '50%', fontSize: 7, fontWeight: 'bold', fontFamily: 'Arial, sans-serif', textAlign: 'center', lineHeight: '16px', display: 'block', boxSizing: 'border-box', border: '1px solid white' }}>{i+1}</span>
                  </div>
                  {ph.caption && <p style={{ fontSize: 8, color: '#78716c', textAlign: 'center', marginTop: 3, fontStyle: 'italic' }}>{i+1}. {ph.caption}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
