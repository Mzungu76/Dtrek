import { FONT } from '@/lib/designTokens'
import { PDF_PAGE_W, PDF_CONTENT_H } from '@/lib/pdfPageGeometry'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { EyeOff } from 'lucide-react'
import type { ActivityMeta } from '@/lib/blobStore'
import { formatDuration } from '@/lib/tcxParser'
import RouteThumb from '@/components/RouteThumb'
import { DiarioYearBand, type DiarioYearBandInfo } from './DiarioYearDivider'

export function DiarioStubPage({ activity, yearBand, onExclude }: {
  activity: ActivityMeta
  yearBand?: DiarioYearBandInfo
  onExclude?: () => void
}) {
  const dateStr = format(new Date(activity.startTime), 'd MMMM yyyy', { locale: it })
  return (
    <div className="diario-page diario-stub-page" style={{
      width: PDF_PAGE_W, minHeight: PDF_CONTENT_H, background: '#fafaf9', margin: '24px auto',
      boxShadow: '0 4px 32px rgba(0,0,0,0.14)', border: '2px dashed #d6d3d1', position: 'relative', overflow: 'hidden',
    }}>
      {yearBand && <DiarioYearBand {...yearBand} />}

      {onExclude && (
        <button onClick={onExclude} className="diario-editor-control print:hidden"
          title="Escludi questa escursione dal diario"
          style={{
            position: 'absolute', top: 16, right: 16, zIndex: 5,
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
            background: 'rgba(0,0,0,0.08)', border: 'none', cursor: 'pointer',
            fontFamily: FONT.barlow, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#73695c',
          }}>
          <EyeOff style={{ width: 13, height: 13 }} /> Escludi
        </button>
      )}

      <span style={{
        position: 'absolute', top: 40, right: -50, transform: 'rotate(35deg)',
        fontSize: 13, fontFamily: FONT.barlow, fontWeight: 700, letterSpacing: 4,
        color: 'rgba(115,105,92,0.18)', textTransform: 'uppercase', width: 240, textAlign: 'center',
      }}>
        Da narrare
      </span>

      <div style={{ padding: '32px 32px 0' }}>
        <p style={{ fontSize: 9, color: '#a9a18e', fontFamily: FONT.barlow, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', margin: '0 0 4px' }}>
          {dateStr}
        </p>
        <h2 style={{ fontFamily: FONT.display, fontSize: 26, fontWeight: 700, color: '#4d4740', margin: '0 0 20px' }}>
          {activity.title ?? 'Escursione'}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
          <div style={{ background: 'white', border: '1px solid #dcd8cc', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 9, color: '#a9a18e', fontFamily: FONT.barlow, textTransform: 'uppercase', letterSpacing: 1 }}>Distanza</div>
            <div style={{ fontSize: 18, fontFamily: FONT.mono, color: '#4d4740' }}>{(activity.distanceMeters / 1000).toFixed(2)} km</div>
          </div>
          <div style={{ background: 'white', border: '1px solid #dcd8cc', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 9, color: '#a9a18e', fontFamily: FONT.barlow, textTransform: 'uppercase', letterSpacing: 1 }}>Dislivello</div>
            <div style={{ fontSize: 18, fontFamily: FONT.mono, color: '#4d4740' }}>{Math.round(activity.elevationGain)} m</div>
          </div>
          <div style={{ background: 'white', border: '1px solid #dcd8cc', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 9, color: '#a9a18e', fontFamily: FONT.barlow, textTransform: 'uppercase', letterSpacing: 1 }}>Durata</div>
            <div style={{ fontSize: 18, fontFamily: FONT.mono, color: '#4d4740' }}>{formatDuration(activity.totalTimeSeconds)}</div>
          </div>
          <div style={{ background: 'white', border: '1px solid #dcd8cc', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 9, color: '#a9a18e', fontFamily: FONT.barlow, textTransform: 'uppercase', letterSpacing: 1 }}>Calorie</div>
            <div style={{ fontSize: 18, fontFamily: FONT.mono, color: '#4d4740' }}>{activity.calories ? `${activity.calories} kcal` : '—'}</div>
          </div>
        </div>

        {activity.routePolyline && activity.routePolyline.length > 1 && (
          <div style={{ height: 220, borderRadius: 10, overflow: 'hidden', border: '1px solid #dcd8cc', background: 'white', marginBottom: 20 }}>
            <RouteThumb polyline={activity.routePolyline} color="#a9a18e" />
          </div>
        )}
      </div>

      <div className="print:hidden" style={{ position: 'absolute', bottom: 32, left: 32, right: 32, textAlign: 'center' }}>
        <a href={`/resoconto/${encodeURIComponent(activity.id)}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, background: '#193b20', color: 'white',
            padding: '10px 20px', borderRadius: 10, fontFamily: FONT.barlow, fontSize: 12, fontWeight: 700,
            textDecoration: 'none', textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
          Racconta questa escursione →
        </a>
      </div>
    </div>
  )
}
