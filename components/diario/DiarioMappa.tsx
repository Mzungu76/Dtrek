import dynamic from 'next/dynamic'
import type { ActivityMeta } from '@/lib/blobStore'
import { PageHeader } from './PageHeader'

const AllRoutesMap = dynamic(() => import('@/components/AllRoutesMap'), { ssr: false })

export function DiarioMappa({ activities, mapImgUrl, mapsInteractive }: { activities: ActivityMeta[]; mapImgUrl: string | null; mapsInteractive: boolean }) {
  const routes = activities
    .filter(a => (a.routePolyline?.length ?? 0) > 1)
    .map(a => ({ id: a.id, title: a.title, startTime: a.startTime, polyline: a.routePolyline! }))

  const PALETTE = ['#166534','#0369a1','#9333ea','#c2410c','#0f766e','#b45309','#be123c','#1d4ed8']

  return (
    <div className="diario-page" style={{
      width: 794, minHeight: 1123, background: 'white', margin: '24px auto',
      padding: '72px 64px', boxShadow: '0 8px 56px rgba(0,0,0,0.28)',
    }}>
      <PageHeader label="Mappa" title="Tutti i percorsi" />

      {/* Screen map (Leaflet) */}
      {routes.length > 0 && (
        <div className="print:hidden diario-global-map" style={{ height: 400, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          <AllRoutesMap routes={routes} height="400px" interactive={mapsInteractive} />
        </div>
      )}

      {/* PDF map (canvas raster) */}
      {mapImgUrl && (
        <img src={mapImgUrl} alt="Mappa percorsi"
          className="hidden print:block"
          style={{ width: '100%', borderRadius: 12, display: 'none' }} />
      )}

      {/* Legend */}
      {routes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 16 }}>
          {routes.slice(0, 8).map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 24, height: 3.5, background: PALETTE[i % PALETTE.length], borderRadius: 2 }} />
              <span style={{ fontSize: 9, color: '#73695c', fontFamily: 'DM Sans, sans-serif' }}>
                {r.title || 'Percorso'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
