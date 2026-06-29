'use client'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { trackNavigation } from '@/lib/navigationHistory'

export default function NavigationTracker() {
  const pathname = usePathname()

  useEffect(() => {
    if (pathname) trackNavigation(pathname)
  }, [pathname])

  return null
}
