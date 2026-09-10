interface Props {
  label: string
  value: string
  sub?: string
  color?: 'terra' | 'forest' | 'red' | 'blue' | 'stone'
  icon?: React.ReactNode
  tooltip?: string
  /** Glass-on-dark variant used inside the route hub's overlay sheets, instead of the light card. */
  dark?: boolean
}

const colorMap = {
  terra:  { bg: 'bg-terra-50',  border: 'border-terra-200',  text: 'text-terra-700',  val: 'text-terra-800'  },
  forest: { bg: 'bg-forest-50', border: 'border-forest-200', text: 'text-forest-700', val: 'text-forest-800' },
  red:    { bg: 'bg-red-50',    border: 'border-red-200',    text: 'text-red-600',    val: 'text-red-800'    },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-600',   val: 'text-blue-800'   },
  stone:  { bg: 'bg-stone-50',  border: 'border-stone-200',  text: 'text-stone-500',  val: 'text-stone-800'  },
}

const darkColorMap = {
  terra:  { text: 'text-terra-300',  val: 'text-white' },
  forest: { text: 'text-emerald-300', val: 'text-white' },
  red:    { text: 'text-red-300',    val: 'text-white' },
  blue:   { text: 'text-sky-300',    val: 'text-white' },
  stone:  { text: 'text-stone-300',  val: 'text-white' },
}

export default function StatCard({ label, value, sub, color = 'stone', icon, tooltip, dark = false }: Props) {
  if (dark) {
    const c = darkColorMap[color]
    return (
      <div className="rounded-xl border border-white/15 bg-white/[0.07] backdrop-blur-sm px-4 py-3 flex flex-col gap-0.5" title={tooltip}>
        <div className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider stat-badge ${c.text}`}>
          {icon && <span>{icon}</span>}
          {label}
        </div>
        <div className={`font-display text-2xl font-semibold ${c.val}`}>{value}</div>
        {sub && <div className="text-xs text-stone-300/60">{sub}</div>}
      </div>
    )
  }
  const c = colorMap[color]
  return (
    <div className={`rounded-xl border ${c.bg} ${c.border} px-4 py-3 flex flex-col gap-0.5`} title={tooltip}>
      <div className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider stat-badge ${c.text}`}>
        {icon && <span>{icon}</span>}
        {label}
      </div>
      <div className={`font-display text-2xl font-semibold ${c.val}`}>{value}</div>
      {sub && <div className="text-xs text-stone-400">{sub}</div>}
    </div>
  )
}
