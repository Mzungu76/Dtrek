import RouteThumb from '@/components/RouteThumb'

export default function RecordCard({ label, value, sub, icon, href, polyline }: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  href?: string
  polyline?: [number, number][]
}) {
  const inner = (
    <div className="bg-white rounded-xl border border-stone-200 p-4 hover:border-forest-300 transition-colors h-full">
      <div className="flex items-start gap-3">
        <div className="text-terra-500 mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-stone-400 uppercase tracking-wide font-medium">{label}</p>
          <p className="font-display text-xl font-bold text-stone-800 leading-tight mt-0.5">{value}</p>
          {sub && (
            <p className="text-xs text-stone-700 font-semibold truncate mt-1.5 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-forest-400 shrink-0" />
              {sub}
            </p>
          )}
        </div>
        {polyline && polyline.length > 1 && (
          <div className="w-14 h-14 rounded-xl bg-forest-50 border border-forest-100 overflow-hidden shrink-0">
            <RouteThumb polyline={polyline} color="#2d7a3d" strokeWidth={2.5} />
          </div>
        )}
      </div>
    </div>
  )
  if (href) return <a href={href} className="block h-full">{inner}</a>
  return inner
}
