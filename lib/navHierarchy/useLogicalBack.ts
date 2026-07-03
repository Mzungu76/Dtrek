'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { resolveParent } from './routeHierarchy'

/**
 * Navigates to the current route's logical parent, always via router.push
 * (never router.back()) so the result is the same whether the page was
 * reached from the tab bar, a deep link, a PWA shortcut, or a fresh tab.
 * No-op at top-level routes (no logical parent).
 */
export function useLogicalBack() {
  const pathname = usePathname()
  const router = useRouter()

  return useCallback(() => {
    const parent = resolveParent(pathname)
    if (parent === null) return
    router.push(parent)
  }, [pathname, router])
}
