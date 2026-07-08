'use client'

import type { ReactNode } from 'react'
import type { RoutePhoto } from '@/lib/activityPhotos'
import type { Section } from '@/lib/reportStore'

const SECTION_COLORS = ['#2d6a4f', '#40916c', '#74c69d', '#b7e4c7', '#d8f3dc']

// ── Render body text — paragraphs + [curiosita] blocks ─────────────────────────

export function RenderBody({ text }: { text: string }) {
  const parts = text.split(/(\[curiosita\][\s\S]*?\[\/curiosita\])/g)
  return (
    <div className="space-y-3">
      {parts.map((part, i) => {
        const m = part.match(/^\[curiosita\]([\s\S]*?)\[\/curiosita\]$/)
        if (m) {
          return (
            <blockquote key={i}
              className="border-l-4 border-amber-400 bg-amber-50 px-4 py-3 rounded-r-xl font-body text-sm italic text-stone-700 leading-relaxed">
              {m[1].trim()}
            </blockquote>
          )
        }
        return part.trim()
          ? <div key={i} className="space-y-2.5">
              {part.trim().split(/\n\n+/).map((p, j) => (
                <p key={j} className="font-body text-[15px] leading-[1.8] text-stone-700">{p.trim()}</p>
              ))}
            </div>
          : null
      })}
    </div>
  )
}

export default function SectionCard({
  section,
  index,
  photo,
  photoIndex,
  floatNode,
}: {
  section: Section
  index: number
  photo?: RoutePhoto
  photoIndex?: number
  floatNode?: ReactNode
}) {
  const color = SECTION_COLORS[index % SECTION_COLORS.length]
  return (
    <article className="bg-white rounded-2xl shadow-sm overflow-hidden mb-5 print:rounded-none print:shadow-none print:mb-0 print:border-b print:border-stone-200">
      <div className="px-6 py-3 flex items-center gap-3" style={{ backgroundColor: color }}>
        <span className="font-display text-[11px] font-bold tracking-[2px] uppercase text-white/70">
          {String(index + 1).padStart(2, '0')}
        </span>
        <h2 className="font-display text-lg font-bold tracking-wide uppercase text-white leading-tight">
          {section.title}
        </h2>
      </div>

      <div className="p-6 print-columns-2">
        {floatNode}
        {photo && (
          <div className="float-right ml-5 mb-3 w-44 print:w-40 print:ml-4 shrink-0 hidden md:block print:block">
            <div className="relative">
              {photoIndex !== undefined && (
                <span className="absolute -top-1.5 -left-1.5 w-5 h-5 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center font-display z-10">
                  {photoIndex}
                </span>
              )}
              <img src={photo.url} alt={photo.caption}
                className="w-full aspect-[4/3] object-cover rounded-xl shadow-md print:rounded-lg" />
            </div>
            {photo.caption && (
              <p className="font-body text-[10px] italic text-stone-400 mt-1 text-center leading-snug">
                {photoIndex !== undefined ? `${photoIndex}. ` : ''}{photo.caption}
              </p>
            )}
          </div>
        )}
        <RenderBody text={section.body} />
      </div>
    </article>
  )
}
