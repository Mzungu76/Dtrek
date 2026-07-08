export function DiarioYearDivider({ year, count, totalKm }: { year: string; count: number; totalKm: number }) {
  return (
    <div className="diario-page" style={{
      width: 794, minHeight: 1123, background: 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)', margin: '24px auto',
      boxShadow: '0 8px 56px rgba(0,0,0,0.28)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', position: 'relative',
    }}>
      <p style={{ fontSize: 11, color: '#e08d3c', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 700, letterSpacing: 6, textTransform: 'uppercase', margin: '0 0 16px' }}>
        Anno
      </p>
      <h2 style={{ fontFamily: 'Playfair Display, serif', fontSize: 96, fontWeight: 700, color: 'white', margin: 0, letterSpacing: -2 }}>
        {year}
      </h2>
      <div style={{ width: 80, height: 2, background: '#e08d3c', margin: '24px 0' }} />
      <div style={{ display: 'flex', gap: 24 }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontFamily: 'DM Sans, sans-serif' }}>
          {count} {count === 1 ? 'escursione' : 'escursioni'}
        </span>
        {totalKm > 0 && (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontFamily: 'DM Sans, sans-serif' }}>
            {totalKm.toFixed(0)} km
          </span>
        )}
      </div>
    </div>
  )
}
