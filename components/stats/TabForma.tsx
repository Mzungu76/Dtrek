'use client'
import { useMemo } from 'react'
import { ActivityMeta } from '@/lib/blobStore'
import { computeTrainingLoad, activityStress, currentForm } from '@/lib/trainingLoad'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, ReferenceLine,
} from 'recharts'
import { Brain, Activity } from 'lucide-react'
import InfoButton from './InfoButton'

interface Props { activities: ActivityMeta[]; onGuideLink: (section: string) => void }

export default function TabForma({ activities, onGuideLink }: Props) {
  const weeklyVolumeData = useMemo(() => {
    const out: { week: string; km: number; gain: number }[] = []
    for (let i = 15; i >= 0; i--) {
      const end   = new Date(); end.setDate(end.getDate() - i * 7)
      const start = new Date(end); start.setDate(start.getDate() - 6)
      const wActs = activities.filter(a => { const d = new Date(a.startTime); return d >= start && d <= end })
      out.push({
        week: format(start, 'dd/MM', { locale: it }),
        km:   Math.round(wActs.reduce((s, a) => s + a.distanceMeters / 1000, 0) * 10) / 10,
        gain: Math.round(wActs.reduce((s, a) => s + a.elevationGain, 0)),
      })
    }
    return out
  }, [activities])

  const weeklyAvg = useMemo(() => {
    const active = weeklyVolumeData.filter(w => w.km > 0)
    if (!active.length) return null
    return {
      avgKm:   Math.round(active.reduce((s, w) => s + w.km, 0) / active.length * 10) / 10,
      maxKm:   Math.max(...active.map(w => w.km)),
      avgGain: Math.round(active.reduce((s, w) => s + w.gain, 0) / active.length),
      activeWeeks: active.length,
    }
  }, [weeklyVolumeData])

  const monthlyProgressData = useMemo(() => {
    const last6: { month: string; km: number; gain: number; esc: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i)
      const y = d.getFullYear(); const m = d.getMonth()
      const mActs = activities.filter(a => { const ad = new Date(a.startTime); return ad.getFullYear() === y && ad.getMonth() === m })
      last6.push({
        month: format(new Date(y, m, 1), 'MMM yy', { locale: it }),
        km:    Math.round(mActs.reduce((s, a) => s + a.distanceMeters / 1000, 0) * 10) / 10,
        gain:  Math.round(mActs.reduce((s, a) => s + a.elevationGain, 0)),
        esc:   mActs.length,
      })
    }
    return last6
  }, [activities])

  const trainingLoadData = useMemo(() => {
    const events = activities.map(a => ({
      date:   format(new Date(a.startTime), 'yyyy-MM-dd'),
      stress: activityStress(a.distanceMeters, a.elevationGain, a.totalTimeSeconds),
    }))
    return computeTrainingLoad(events, 90)
  }, [activities])

  const latestForm = useMemo(() => {
    if (!trainingLoadData.length) return null
    const last = trainingLoadData[trainingLoadData.length - 1]
    return { ...last, status: currentForm(last.tsb) }
  }, [trainingLoadData])

  return (
    <div className="space-y-6">
      {latestForm && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-1 flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5" /> Stato forma attuale
              <InfoButton section="training-load" onGuideLink={onGuideLink} />
            </p>
            <p className="text-2xl font-bold mt-1" style={{ color: latestForm.status.color }}>{latestForm.status.label}</p>
            <p className="text-xs text-stone-500 mt-1">{latestForm.status.description}</p>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-1">CTL — Fitness (τ=42gg)</p>
            <p className="text-2xl font-bold text-forest-700">{latestForm.ctl.toFixed(1)}</p>
            <p className="text-xs text-stone-500 mt-1">Carico cronico accumulato</p>
          </div>
          <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
            <p className="text-xs text-stone-400 uppercase tracking-wide font-medium mb-1">ATL — Fatica (τ=7gg)</p>
            <p className="text-2xl font-bold text-terra-600">{latestForm.atl.toFixed(1)}</p>
            <p className="text-xs text-stone-500 mt-1">Carico acuto recente</p>
          </div>
        </div>
      )}

      {weeklyAvg && (
        <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
          <h3 className="font-medium text-stone-700 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-forest-600" /> Medie settimanali (ultime 16 settimane)
            <InfoButton section="volume-settimanale" onGuideLink={onGuideLink} />
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Km medi/settimana',  value: `${weeklyAvg.avgKm} km` },
              { label: 'Settimana migliore',  value: `${weeklyAvg.maxKm} km` },
              { label: 'D+ medi/settimana',   value: `${weeklyAvg.avgGain} m` },
              { label: 'Settimane attive',    value: `${weeklyAvg.activeWeeks}/16` },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="font-display text-2xl font-bold text-forest-700">{value}</p>
                <p className="text-xs text-stone-400 mt-1 leading-tight">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <h3 className="font-medium text-stone-700 mb-1">Volume settimanale — ultime 16 settimane</h3>
        <p className="text-xs text-stone-400 mb-4">Km percorsi e dislivello per settimana.</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyVolumeData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} tickLine={false} interval={1} />
              <YAxis yAxisId="km"   orientation="left"  tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit=" km" width={44} />
              <YAxis yAxisId="gain" orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit=" m"  width={48} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                formatter={(v: any, name: string) => [name === 'km' ? `${v} km` : `${v} m`, name === 'km' ? 'Distanza' : 'Dislivello D+']} />
              <Legend formatter={(v: string) => v === 'km' ? 'Distanza (km)' : 'Dislivello D+ (m)'} wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="km"   dataKey="km"   fill="#378d44" radius={[3,3,0,0]} />
              <Bar yAxisId="gain" dataKey="gain" fill="#c05a17" radius={[3,3,0,0]} opacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100">
          <h3 className="font-medium text-stone-700">Progressione mensile — ultimi 6 mesi</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wider">
              <tr>
                {['Mese', 'Escursioni', 'Distanza', 'Dislivello'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {monthlyProgressData.map((m, i) => (
                <tr key={m.month} className={i === monthlyProgressData.length - 1 ? 'bg-forest-50' : ''}>
                  <td className="px-4 py-3 font-medium text-stone-700 capitalize">{m.month}</td>
                  <td className="px-4 py-3 font-mono text-stone-600">{m.esc}</td>
                  <td className="px-4 py-3 font-mono text-forest-700">{m.km} km</td>
                  <td className="px-4 py-3 font-mono text-terra-600">{m.gain.toLocaleString('it')} m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <h3 className="font-medium text-stone-700 mb-1 flex items-center gap-2">
          <Brain className="w-4 h-4 text-forest-600" /> Training Load — ultimi 90 giorni
          <InfoButton section="training-load" onGuideLink={onGuideLink} />
        </h3>
        <p className="text-xs text-stone-400 mb-4">
          CTL (fitness, verde) · ATL (fatica, arancio) · TSB (forma, blu — positivo = fresco, negativo = affaticato)
        </p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trainingLoadData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false}
                tickFormatter={d => format(new Date(d), 'dd/MM')} interval={13} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                labelFormatter={d => format(new Date(d as string), 'dd MMM yyyy', { locale: it })}
                formatter={(v: any, name: string) => {
                  const labels: Record<string, string> = { ctl: 'Fitness (CTL)', atl: 'Fatica (ATL)', tsb: 'Forma (TSB)' }
                  return [v, labels[name] ?? name]
                }} />
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="ctl" stroke="#378d44" strokeWidth={2} dot={false} name="ctl" />
              <Line type="monotone" dataKey="atl" stroke="#c05a17" strokeWidth={2} dot={false} name="atl" />
              <Line type="monotone" dataKey="tsb" stroke="#0ea5e9" strokeWidth={2} dot={false} name="tsb" />
              <Legend wrapperStyle={{ fontSize: 12 }}
                formatter={(v: string) => ({ ctl: 'Fitness (CTL)', atl: 'Fatica (ATL)', tsb: 'Forma (TSB)' }[v] ?? v)} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-stone-200 p-5 shadow-sm">
        <h3 className="font-medium text-stone-700 mb-4 flex items-center gap-2">
          Carico giornaliero (TSS stimato) <InfoButton section="tss" onGuideLink={onGuideLink} />
        </h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trainingLoadData.filter(d => d.stress > 0)} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e4dc" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false}
                tickFormatter={d => format(new Date(d), 'dd/MM')} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e8e4dc', fontSize: 12 }}
                labelFormatter={d => format(new Date(d as string), 'dd MMM', { locale: it })}
                formatter={(v: any) => [v, 'Stress (TSS)']} />
              <Bar dataKey="stress" fill="#378d44" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-sky-50 rounded-2xl border border-sky-100 p-5 text-sm text-sky-800 space-y-2">
        <p className="font-semibold">Come leggere questi grafici</p>
        <p><strong>CTL (Fitness)</strong> sale lentamente con l&apos;allenamento costante — rappresenta la capacità aerobica accumulata.</p>
        <p><strong>ATL (Fatica)</strong> sale velocemente dopo un&apos;uscita impegnativa e scende in pochi giorni di riposo.</p>
        <p><strong>TSB (Forma)</strong> = CTL − ATL. Positivo significa che sei fresco e pronto; negativo che sei affaticato. Il picco di forma si ottiene dopo alcuni giorni di recupero prima di un evento importante.</p>
        <p className="text-xs text-sky-600">I valori TSS sono stimati da distanza, dislivello e durata.</p>
      </div>
    </div>
  )
}
