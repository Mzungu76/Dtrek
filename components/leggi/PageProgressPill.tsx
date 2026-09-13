// Pillola fluttuante di avanzamento — sito pubblico del Diario, direzione Taccuino Botanico
// (docs/siti-pubblici-taccuino-piano.md). Fissa in fondo allo schermo mentre si scorre la pagina
// (non c'è una barra di navigazione fissa sotto, come nell'app: qui è la sola indicazione di
// avanzamento). Componente server puro: nessuno stato, nessun JavaScript spedito al browser.
export function PageProgressPill({ label, current, total, insetLeft = 34 }: {
  /** Titolo dell'escursione corrente. */
  label: string
  current: number
  total: number
  /** Larghezza della rilegatura da cui la pillola resta staccata — 34px altrove in questo set. */
  insetLeft?: number
}) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0
  return (
    <div
      className="fixed right-3.5 z-30 rounded-2xl px-3.5 py-2.5 flex items-center gap-2.5"
      style={{
        left: insetLeft + 14,
        bottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
        background: 'rgba(46,42,34,.92)', backdropFilter: 'blur(6px)', boxShadow: '0 8px 24px rgba(0,0,0,.22)',
      }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-xs truncate">Escursione {current} di {total} &middot; {label}</p>
        <div className="h-[2.5px] rounded-full bg-white/20 mt-1.5 overflow-hidden">
          <div className="h-full bg-[#e9ab64]" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}
