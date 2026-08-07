import { FONT } from '@/lib/designTokens'

export interface DiarioYearBandInfo { year: string; count: number; totalKm: number }

/**
 * Fascia di transizione tra un anno e il successivo, incorporata in cima alla prima pagina
 * dell'anno (vedi `yearBand` in DiarioReportPage e DiarioStubPage) invece di occupare una pagina
 * A4 intera a sé stante.
 *
 * Prima questo componente ERA una pagina intera (`className="diario-page"`, `minHeight: 1123`,
 * contenuto centrato verticalmente): con sei anni di attività il diario aveva sei pagine quasi
 * vuote — solo il numero dell'anno e due righe di conteggio, il resto sfondo verde. Nel PDF
 * ciascuna costava comunque una pagina fisica intera, dato che ogni elemento di primo livello ne
 * apre sempre una nuova: uno spreco di carta (e di scroll) sproporzionato al contenuto.
 */
export function DiarioYearBand({ year, count, totalKm }: DiarioYearBandInfo) {
  return (
    <div className="pdf-block" style={{
      background: 'linear-gradient(100deg,#193b20 0%,#1c4724 55%,#20592b 100%)',
      padding: '20px 48px',
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <span style={{ fontFamily: FONT.barlow, fontSize: 10, fontWeight: 700, letterSpacing: 4, color: '#e08d3c', textTransform: 'uppercase' }}>
          Anno
        </span>
        <h2 style={{ fontFamily: FONT.display, fontSize: 30, fontWeight: 700, color: 'white', margin: 0, letterSpacing: -0.5 }}>
          {year}
        </h2>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <span style={{ fontFamily: FONT.body, fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>
          {count} {count === 1 ? 'escursione' : 'escursioni'}
        </span>
        {totalKm > 0 && (
          <span style={{ fontFamily: FONT.body, fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>
            {totalKm.toFixed(0)} km
          </span>
        )}
      </div>
    </div>
  )
}
