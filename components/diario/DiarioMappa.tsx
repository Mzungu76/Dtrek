import { FONT, ROUTE_COLORS } from '@/lib/designTokens'
import { PDF_PAGE_W, PDF_CONTENT_H } from '@/lib/pdfPageGeometry'
import dynamic from 'next/dynamic'
import type { ActivityMeta } from '@/lib/blobStore'
import { PageHeader } from './PageHeader'

const AllRoutesMap = dynamic(() => import('@/components/AllRoutesMap'), { ssr: false })

// Nota: non riceve più `mapImgUrl`. Conteneva un <img> destinato alla stampa nativa (Ctrl+P) con
// `className="print:block"` ma anche `style={{ display: 'none' }}` inline: lo stile in linea vince
// sempre sulla classe, quindi quell'immagine non è mai comparsa, nemmeno stampando. Il raster
// pre-generato resta però utile come cache per il PDF (vedi `mapForPdf` in app/diario/page.tsx).
export function DiarioMappa({ activities, mapsInteractive }: { activities: ActivityMeta[]; mapsInteractive: boolean }) {
  const routes = activities
    .filter(a => (a.routePolyline?.length ?? 0) > 1)
    .map(a => ({ id: a.id, title: a.title, startTime: a.startTime, polyline: a.routePolyline! }))

  // Stessa palette di AllRoutesMap e del raster generato per il PDF (lib/designTokens.ts): prima
  // erano tre elenchi di colori scritti a mano separatamente, e lo stesso percorso poteva
  // risultare di un colore sulla mappa e di un altro nella legenda qui sotto.
  const PALETTE = ROUTE_COLORS

  return (
    <div className="diario-page" style={{
      width: PDF_PAGE_W, minHeight: PDF_CONTENT_H, background: 'white', margin: '24px auto',
      padding: '72px 64px', boxShadow: '0 8px 56px rgba(0,0,0,0.28)',
    }}>
      <PageHeader label="Mappa" title="Tutti i percorsi" />

      {/* Screen map (Leaflet) */}
      {routes.length > 0 && (
        <div className="print:hidden diario-global-map" style={{ height: 400, borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          <AllRoutesMap routes={routes} height="400px" interactive={mapsInteractive} />
        </div>
      )}

      {/* Legend */}
      {routes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 16 }}>
          {routes.slice(0, 8).map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 24, height: 3.5, background: PALETTE[i % PALETTE.length], borderRadius: 2 }} />
              <span style={{ fontSize: 9, color: '#73695c', fontFamily: FONT.body }}>
                {r.title || 'Percorso'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
