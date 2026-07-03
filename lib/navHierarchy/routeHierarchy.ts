// Single source of truth for the app's logical page hierarchy, used both to
// intercept the hardware/gesture back button (GlobalBackInterceptor) and to
// drive every in-page back link (BackLink). Keeping one map means the two
// can never disagree about where "back" goes.
//
// A parent of `null` marks a top-level destination (reachable from the
// bottom tab bar or directly): pressing back there falls through to native
// browser/PWA behavior instead of being redirected.

type ParentOf = string | ((params: Record<string, string>) => string) | null

interface RouteEntry {
  pattern: string
  parent: ParentOf
}

export const ROUTE_HIERARCHY: RouteEntry[] = [
  { pattern: '/', parent: null },
  { pattern: '/statistiche', parent: null },
  { pattern: '/esplora', parent: null },
  { pattern: '/diario', parent: null },

  { pattern: '/profilo', parent: '/' },
  { pattern: '/upload', parent: '/' },
  { pattern: '/fonti-e-crediti', parent: '/' },
  { pattern: '/vette', parent: '/statistiche' },

  { pattern: '/escursione/[id]', parent: '/diario' },
  { pattern: '/escursione/[id]/flora', parent: (p) => `/escursione/${p.id}` },
  { pattern: '/escursione/[id]/animali', parent: (p) => `/escursione/${p.id}` },
  { pattern: '/resoconto/[id]', parent: (p) => `/escursione/${p.id}` },
  { pattern: '/resoconto/[id]/racconta', parent: (p) => `/resoconto/${p.id}` },

  { pattern: '/programma/[id]', parent: '/' },
  { pattern: '/programma/[id]/flora', parent: (p) => `/programma/${p.id}` },
  { pattern: '/programma/[id]/animali', parent: (p) => `/programma/${p.id}` },
  { pattern: '/programma/[id]/naviga', parent: (p) => `/programma/${p.id}` },
  { pattern: '/guida/[id]', parent: (p) => `/programma/${p.id}` },

  { pattern: '/login', parent: null },
  { pattern: '/signup', parent: null },
  { pattern: '/reset-password', parent: '/login' },

  // /leggi/*, /s/[token] intentionally excluded: public share links live
  // outside the authenticated hierarchy and rely on plain browser back.
]

export const ROUTE_LABELS: Record<string, string> = {
  '/': 'Calendario',
  '/statistiche': 'Statistiche',
  '/esplora': 'Esplora',
  '/diario': 'Diario',
  '/login': 'Accedi',
}

function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = pathname.split('/').filter(Boolean)
  if (patternParts.length !== pathParts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i]
    const pathPart = pathParts[i]
    if (patternPart.startsWith('[') && patternPart.endsWith(']')) {
      params[patternPart.slice(1, -1)] = decodeURIComponent(pathPart)
    } else if (patternPart !== pathPart) {
      return null
    }
  }
  return params
}

/** Resolves the logical parent of a pathname, or null if it's top-level (or unknown). */
export function resolveParent(pathname: string): string | null {
  for (const entry of ROUTE_HIERARCHY) {
    const params = matchPattern(entry.pattern, pathname)
    if (!params) continue
    if (entry.parent === null) return null
    return typeof entry.parent === 'function' ? entry.parent(params) : entry.parent
  }
  return null
}
