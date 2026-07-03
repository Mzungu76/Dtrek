'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { resolveParent } from '@/lib/navHierarchy/routeHierarchy'
import { useLogicalBack } from '@/lib/navHierarchy/useLogicalBack'

// Routes that manage their own popstate-based guard and must not be
// touched here. Today that's only the live GPS navigation session, which
// intercepts back to confirm before ending a hike in progress
// (components/navigation/ActiveNavigationView.tsx).
const EXCLUDED_PATTERNS = [/^\/programma\/[^/]+\/naviga$/]

export default function GlobalBackInterceptor() {
  const pathname = usePathname()
  const goToLogicalParent = useLogicalBack()
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname

  useEffect(() => {
    if (EXCLUDED_PATTERNS.some((re) => re.test(pathname))) return

    history.pushState({ dtrekBackGuard: true }, '')

    const onPopState = () => {
      if (resolveParent(pathnameRef.current) === null) return
      history.pushState({ dtrekBackGuard: true }, '')
      goToLogicalParent()
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [pathname, goToLogicalParent])

  return null
}
