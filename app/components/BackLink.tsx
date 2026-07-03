'use client'

import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { resolveParent, ROUTE_LABELS } from '@/lib/navHierarchy/routeHierarchy'

interface Props {
  /** Overrides the default label (e.g. a dynamic hike/activity title). */
  label?: string
  className?: string
  /** Used only if the current route has no entry in the hierarchy. */
  fallbackHref?: string
}

export default function BackLink({ label, className, fallbackHref }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const parent = resolveParent(pathname) ?? fallbackHref ?? '/'
  const text = label ?? ROUTE_LABELS[parent] ?? 'Indietro'

  return (
    <button onClick={() => router.push(parent)} className={className}>
      <ArrowLeft className="w-4 h-4" />
      <span>{text}</span>
    </button>
  )
}
