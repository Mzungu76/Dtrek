'use client'
import { ChevronDown, ChevronRight, GripVertical, MoreVertical, ArrowRightLeft, Settings } from 'lucide-react'
import CoverThumb from './CoverThumb'
import InlineTitle from './InlineTitle'
import PublishToggle from './PublishToggle'
import { useRowDrag } from './useRowDrag'
import type { RaccoltaTreeNode, DiarioTreeNode } from '@/app/api/collections/tree/route'

export const DIARIO_ROW_H = 58

function GearButton({ onClick, size = 16, label }: { onClick: () => void; size?: number; label: string }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick() }} aria-label={label} title={label}
      className="text-stone-400 hover:text-forest-600 shrink-0 p-1 -m-1 transition-colors">
      <Settings style={{ width: size, height: size }} />
    </button>
  )
}

function fmtKm(m: number) { return m >= 100_000 ? `${Math.round(m / 1000)} km` : `${(m / 1000).toFixed(1)} km` }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) }

export interface RaccoltaSectionActions {
  onRenameRaccolta: (raccoltaId: string, title: string) => void
  onDeleteRaccolta: (raccoltaId: string) => void
  onOpenDetails: (raccoltaId: string) => void
  onOpenRaccoltaSettings: (raccoltaId: string, title: string) => void
  onPickRaccoltaCover: (raccoltaId: string, file: File) => void
  onToggleRaccoltaPublish: (raccoltaId: string, currentlyPublished: boolean) => void
  onReorderDiari: (raccoltaId: string, fromIndex: number, toIndex: number) => void
  onRenameDiario: (diarioId: string, title: string) => void
  onOpenDiarioSettings: (diarioId: string, title: string) => void
  onPickDiarioCover: (diarioId: string, file: File) => void
  onMoveDiarioRequest: (diarioId: string) => void
  onToggleDiarioPublish: (diarioId: string, currentlyPublished: boolean) => void
  onRenameReportage: (reportageId: string, title: string) => void
  onOpenReportageSettings: (reportageId: string, diarioId: string, title: string) => void
  onMoveReportageRequest: (reportageId: string) => void
  onToggleReportagePublish: (reportageId: string, currentlyPublished: boolean) => void
  onOpenReportage: (reportageId: string) => void
}

interface RaccoltaSectionProps {
  raccolta: RaccoltaTreeNode
  expanded: boolean
  expandedDiari: Set<string>
  kebabOpen: boolean
  raccoltaCoverUploadingId: string | null
  diarioCoverUploadingId: string | null
  raccoltaPublishBusyId: string | null
  diarioPublishBusyId: string | null
  reportagePublishBusyId: string | null
  isDragging: boolean
  dropBefore: boolean
  deltaY: number
  /** Falso mentre un filtro di pubblicazione è attivo — gli indici mostrati non sono più quelli
   *  veri (`position` sul server), quindi il riordino qui e nel Diario si disattiva invece di
   *  scrivere posizioni sbagliate (vedi app/raccolte/page.tsx). */
  dragEnabled?: boolean
  onToggleExpand: () => void
  onToggleDiario: (diarioId: string) => void
  onToggleKebab: () => void
  onGripPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  onGripPointerMove: (e: React.PointerEvent<HTMLElement>) => void
  onGripPointerUp: (e: React.PointerEvent<HTMLElement>) => void
  actions: RaccoltaSectionActions
}

export default function RaccoltaSection({
  raccolta, expanded, expandedDiari, kebabOpen, raccoltaCoverUploadingId, diarioCoverUploadingId,
  raccoltaPublishBusyId, diarioPublishBusyId, reportagePublishBusyId,
  isDragging, dropBefore, deltaY, dragEnabled = true, onToggleExpand, onToggleDiario, onToggleKebab,
  onGripPointerDown, onGripPointerMove, onGripPointerUp, actions,
}: RaccoltaSectionProps) {
  const diariDrag = useRowDrag(DIARIO_ROW_H, raccolta.diari.length, (from, to) => actions.onReorderDiari(raccolta.id, from, to))
  const reportageCount = raccolta.diari.reduce((s, d) => s + d.reportage.length, 0)

  return (
    <div>
      {dropBefore && <div className="h-[3px] mx-1 rounded-full bg-forest-500" />}
      <div
        className="relative flex items-center gap-2.5 py-2.5 border-b border-stone-100 cursor-pointer"
        style={isDragging ? { transform: `translateY(${deltaY}px)`, boxShadow: '0 10px 24px rgba(44,37,32,0.18)', background: '#fff', borderRadius: 14, zIndex: 10 } : undefined}
        onClick={onToggleExpand}
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-stone-600 shrink-0" /> : <ChevronRight className="w-4 h-4 text-stone-500 shrink-0" />}
        <CoverThumb
          kind="raccolta" coverUrl={raccolta.coverUrl} size={32} editable
          uploading={raccoltaCoverUploadingId === raccolta.id}
          onPickImage={f => actions.onPickRaccoltaCover(raccolta.id, f)}
        />
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-[15px] text-stone-800 truncate">{raccolta.title}</p>
          <p className="font-barlow text-[11px] text-stone-400 tracking-wide">
            {raccolta.diari.length} diari · {reportageCount} reportage
          </p>
        </div>
        <PublishToggle
          published={raccolta.isPublished}
          busy={raccoltaPublishBusyId === raccolta.id}
          onToggle={() => actions.onToggleRaccoltaPublish(raccolta.id, raccolta.isPublished)}
          size={16}
        />
        <GearButton onClick={() => actions.onOpenRaccoltaSettings(raccolta.id, raccolta.title)} label="Impostazioni della Raccolta" size={16} />
        <button
          onPointerDown={e => { e.stopPropagation(); onGripPointerDown(e) }}
          onPointerMove={e => { e.stopPropagation(); onGripPointerMove(e) }}
          onPointerUp={e => { e.stopPropagation(); onGripPointerUp(e) }}
          onClick={e => e.stopPropagation()}
          aria-label="Trascina per riordinare le Raccolte"
          className="text-stone-300 shrink-0 touch-none p-1 -m-1"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <button onClick={e => { e.stopPropagation(); onToggleKebab() }} aria-label="Altre azioni" className="text-forest-600 shrink-0 p-1 -m-1">
          <MoreVertical className="w-4 h-4" />
        </button>

        {kebabOpen && (
          <div onClick={e => e.stopPropagation()} className="absolute top-9 right-2 bg-white border border-stone-200 rounded-xl shadow-lg w-48 z-20 overflow-hidden">
            <button
              onClick={() => { const t = window.prompt('Nuovo titolo della Raccolta', raccolta.title); if (t && t.trim()) actions.onRenameRaccolta(raccolta.id, t.trim()) }}
              className="w-full text-left px-3.5 py-2.5 text-sm text-stone-700 border-b border-stone-100"
            >
              Rinomina
            </button>
            <button onClick={() => actions.onOpenDetails(raccolta.id)} className="w-full text-left px-3.5 py-2.5 text-sm text-stone-700 border-b border-stone-100">
              Contenuti e prefazione
            </button>
            <button onClick={() => actions.onDeleteRaccolta(raccolta.id)} className="w-full text-left px-3.5 py-2.5 text-sm text-red-600">
              Elimina Raccolta
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="pl-6">
          {raccolta.diari.length === 0 && (
            <p className="py-3 text-xs text-stone-400 font-lora italic">Nessun Diario qui — spostane uno da un&apos;altra Raccolta.</p>
          )}
          {raccolta.diari.map((diario, i) => (
            <div key={diario.id}>
              {diariDrag.dropIndex === i && diariDrag.dragIndex !== null && diariDrag.dragIndex !== i && (
                <div className="h-[3px] mx-1 rounded-full bg-forest-500" />
              )}
              <DiarioRow
                diario={diario}
                expanded={expandedDiari.has(diario.id)}
                isDragging={diariDrag.dragIndex === i}
                deltaY={diariDrag.dragIndex === i ? diariDrag.deltaY : 0}
                coverUploading={diarioCoverUploadingId === diario.id}
                publishBusy={diarioPublishBusyId === diario.id}
                reportagePublishBusyId={reportagePublishBusyId}
                onToggleExpand={() => onToggleDiario(diario.id)}
                onGripPointerDown={e => { if (dragEnabled) diariDrag.start(i, e) }}
                onGripPointerMove={diariDrag.move}
                onGripPointerUp={diariDrag.end}
                onRename={title => actions.onRenameDiario(diario.id, title)}
                onOpenSettings={() => actions.onOpenDiarioSettings(diario.id, diario.title)}
                onPickCover={f => actions.onPickDiarioCover(diario.id, f)}
                onMoveRequest={() => actions.onMoveDiarioRequest(diario.id)}
                onTogglePublish={() => actions.onToggleDiarioPublish(diario.id, diario.isPublished)}
                onRenameReportage={(id, title) => actions.onRenameReportage(id, title)}
                onOpenReportageSettings={(id, title) => actions.onOpenReportageSettings(id, diario.id, title)}
                onMoveReportageRequest={id => actions.onMoveReportageRequest(id)}
                onToggleReportagePublish={(id, current) => actions.onToggleReportagePublish(id, current)}
                onOpenReportage={id => actions.onOpenReportage(id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DiarioRow({
  diario, expanded, isDragging, deltaY, coverUploading, publishBusy, reportagePublishBusyId,
  onToggleExpand, onGripPointerDown, onGripPointerMove, onGripPointerUp,
  onRename, onOpenSettings, onPickCover, onMoveRequest, onTogglePublish,
  onRenameReportage, onOpenReportageSettings, onMoveReportageRequest, onToggleReportagePublish, onOpenReportage,
}: {
  diario: DiarioTreeNode
  expanded: boolean
  isDragging: boolean
  deltaY: number
  coverUploading: boolean
  publishBusy: boolean
  reportagePublishBusyId: string | null
  onToggleExpand: () => void
  onGripPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  onGripPointerMove: (e: React.PointerEvent<HTMLElement>) => void
  onGripPointerUp: (e: React.PointerEvent<HTMLElement>) => void
  onRename: (title: string) => void
  onOpenSettings: () => void
  onPickCover: (file: File) => void
  onMoveRequest: () => void
  onTogglePublish: () => void
  onRenameReportage: (id: string, title: string) => void
  onOpenReportageSettings: (id: string, title: string) => void
  onMoveReportageRequest: (id: string) => void
  onToggleReportagePublish: (id: string, currentlyPublished: boolean) => void
  onOpenReportage: (id: string) => void
}) {
  const hasReportage = diario.reportage.length > 0
  return (
    <div>
      <div
        className={`flex items-center gap-2 py-2 border-b border-stone-50 ${hasReportage ? 'cursor-pointer' : ''}`}
        style={isDragging ? { transform: `translateY(${deltaY}px)`, boxShadow: '0 8px 20px rgba(44,37,32,0.16)', background: '#fdfcf9', borderRadius: 10, zIndex: 10, position: 'relative' } : undefined}
        onClick={hasReportage ? onToggleExpand : undefined}
      >
        {hasReportage ? (
          expanded ? <ChevronDown className="w-3.5 h-3.5 text-stone-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
        ) : <span className="w-3.5 shrink-0" />}
        <CoverThumb kind="diario" coverUrl={diario.coverUrl} size={26} editable uploading={coverUploading} onPickImage={onPickCover} />
        <div className="flex-1 min-w-0">
          <InlineTitle
            value={diario.title}
            onCommit={onRename}
            className="font-display font-bold text-sm text-stone-800 truncate"
            inputClassName="w-full font-display font-bold text-sm text-stone-800 bg-transparent border-b border-forest-500 outline-none"
          />
          <p className="font-barlow text-[10px] text-stone-400">{diario.reportage.length} reportage</p>
        </div>
        <PublishToggle published={diario.isPublished} busy={publishBusy} onToggle={onTogglePublish} size={14} />
        <GearButton onClick={onOpenSettings} label="Impostazioni del Diario" size={14} />
        <button onClick={e => { e.stopPropagation(); onMoveRequest() }} aria-label="Sposta in un'altra Raccolta" className="text-stone-400 shrink-0 p-1 -m-1">
          <ArrowRightLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onPointerDown={e => { e.stopPropagation(); onGripPointerDown(e) }}
          onPointerMove={e => { e.stopPropagation(); onGripPointerMove(e) }}
          onPointerUp={e => { e.stopPropagation(); onGripPointerUp(e) }}
          onClick={e => e.stopPropagation()}
          aria-label="Trascina per riordinare i Diari"
          className="text-stone-300 shrink-0 touch-none p-1 -m-1"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && hasReportage && (
        <div className="pl-6">
          {diario.reportage.map(r => (
            <div key={r.id} className="flex items-center gap-2 py-1.5 border-b border-stone-50/70 cursor-pointer" onClick={() => onOpenReportage(r.id)}>
              <span className="w-3.5 shrink-0" />
              <CoverThumb kind="reportage" coverUrl={null} size={20} />
              <div className="flex-1 min-w-0">
                <InlineTitle
                  value={r.title}
                  onCommit={title => onRenameReportage(r.id, title)}
                  className="font-body text-xs font-medium text-stone-700 truncate"
                  inputClassName="w-full text-xs font-medium text-stone-700 bg-transparent border-b border-forest-500 outline-none"
                />
                <p className="font-barlow text-[10px] text-stone-400">{fmtDate(r.startTime)} · {fmtKm(r.distanceMeters)}</p>
              </div>
              <PublishToggle
                published={r.isPublished}
                busy={reportagePublishBusyId === r.id}
                disabled={!r.hasReport}
                disabledTitle="Scrivi prima il racconto"
                onToggle={() => onToggleReportagePublish(r.id, r.isPublished)}
                size={12}
              />
              <GearButton onClick={() => onOpenReportageSettings(r.id, r.title)} label="Impostazioni del Reportage" size={12} />
              <button onClick={e => { e.stopPropagation(); onMoveReportageRequest(r.id) }} aria-label="Sposta in un altro Diario" className="text-stone-300 shrink-0 p-1 -m-1">
                <ArrowRightLeft className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
