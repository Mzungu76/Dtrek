import { FONT } from '@/lib/designTokens'
import { PDF_PAGE_W, PDF_CONTENT_H } from '@/lib/pdfPageGeometry'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { PageHeader } from './PageHeader'
import type { BookPage } from './types'

export function DiarioIndice({ pages }: { pages: BookPage[] }) {
  return (
    <div className="diario-page" style={{
      width: PDF_PAGE_W, minHeight: PDF_CONTENT_H, background: 'white', margin: '24px auto',
      padding: '72px 64px', boxShadow: '0 8px 56px rgba(0,0,0,0.28)',
    }}>
      <PageHeader label="Indice" title="Le escursioni" />
      <div style={{ borderTop: '1px solid #eeece5' }}>
        {pages.map((page, i) => {
          const isStub = page.kind === 'stub'
          const title = isStub ? (page.activity.title ?? 'Escursione') : (page.report.title || page.report.activity?.title || 'Escursione')
          const distanceM = isStub ? page.activity.distanceMeters : page.report.activity?.distance_meters ?? 0
          const elevGain  = isStub ? page.activity.elevationGain  : page.report.activity?.elevation_gain ?? 0
          const dateStr = format(new Date(page.startTime), 'd MMMM yyyy', { locale: it })
          const year = new Date(page.startTime).getFullYear()
          const prevYear = i > 0 ? new Date(pages[i - 1].startTime).getFullYear() : null
          const showYearHeader = year !== prevYear
          return (
            <div key={isStub ? `stub-${page.activity.id}` : `rep-${page.report.id}`}>
              {showYearHeader && (
                <p style={{ fontSize: 11, color: '#e08d3c', fontFamily: FONT.barlow, fontWeight: 900, letterSpacing: 4, margin: i === 0 ? '0 0 4px' : '24px 0 4px' }}>
                  {year}
                </p>
              )}
              <div className="pdf-block" style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                padding: '14px 0', borderBottom: '1px solid #eeece5',
              }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 11, color: '#a9a18e', fontFamily: FONT.mono, fontWeight: 500, minWidth: 24 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    {/* UX-AUDIT.md P-M6 — un titolo GPX grezzo (es. il nome del file importato)
                        senza troncamento spezza l'altezza uniforme di questa riga rispetto alle
                        altre voci dell'indice — nowrap/ellipsis invece di andare a capo, il titolo
                        completo resta comunque leggibile aprendo il resoconto/la guida. */}
                    <div style={{
                      fontSize: 15, fontFamily: FONT.display, fontWeight: 700, color: isStub ? '#a9a18e' : '#193b20', letterSpacing: -0.2,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }} title={title}>
                      {title} {isStub && <span style={{ fontSize: 9, fontFamily: FONT.barlow, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>· da narrare</span>}
                    </div>
                    {dateStr && (
                      <div style={{ fontSize: 10, color: '#a9a18e', fontFamily: FONT.lora, fontStyle: 'italic', marginTop: 2 }}>{dateStr}</div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#73695c', fontFamily: FONT.body, flexShrink: 0, marginLeft: 16 }}>
                  {distanceM > 0 && <span>{(distanceM / 1000).toFixed(1)} km</span>}
                  {elevGain > 0 && <span>{Math.round(elevGain)} m D+</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
