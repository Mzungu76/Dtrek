import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import ExternalOpen from '@/lib/native/externalOpenPlugin'

/**
 * Where "apri l'app DTrek principale" points to from inside the standalone
 * Navigator app. The main app has no native shell of its own (stays web/
 * PWA — see docs/navigation-engine-analysis.md §5), so this opens the
 * website in the system browser rather than navigating Navigator's own
 * WebView there — keeping the two apps' surfaces genuinely separate instead
 * of quietly turning Navigator back into a full-app WebView. From the
 * system browser the user can also "Aggiungi a schermata Home" to install
 * the PWA, which today is the closest equivalent to "downloading" the main
 * app.
 *
 * Override with NEXT_PUBLIC_MAIN_APP_URL once the production domain is
 * known; falls back to the site root of wherever Navigator itself is being
 * served from (same-origin fetch, so this works in dev/staging too without
 * extra config).
 */
export function mainAppUrl(path = '/'): string {
  const base = process.env.NEXT_PUBLIC_MAIN_APP_URL
    ?? (typeof window !== 'undefined' ? window.location.origin : '')
  return base ? new URL(path, base).toString() : path
}

/**
 * Navigator's own WebView and the browser this opens are separate storage contexts — without
 * this, a user who just logged into Navigator would be asked to log in AGAIN the moment they
 * open Dtrek, even on their very first "Upgrade a Dtrek". POST /api/auth/handoff (same origin,
 * so it rides Navigator's own session cookies) mints a one-time Supabase magic link for the
 * current user and hands back a URL into our own /auth/callback — opening that instead of the
 * plain page establishes a real session in the browser with no credentials re-entered. Best
 * effort: any failure (offline, anonymous session, endpoint down) just falls back to the plain
 * URL, same as before — worst case the user logs in once, never a hard failure to open Dtrek.
 */
async function handoffUrl(path: string): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return typeof data.url === 'string' ? data.url : null
  } catch {
    return null
  }
}

/**
 * On native, opens via a plain Android Intent (lib/native/externalOpenPlugin.ts) rather than
 * `@capacitor/browser`'s Custom Tabs — a Custom Tab stays bound to Navigator's own UI and never
 * goes through Android's normal app-link resolution, so it could never hand off to Dtrek's PWA
 * even when the user has already installed it (Chrome registers an installed PWA/WebAPK as a
 * handler for its own domain — a plain ACTION_VIEW intent is what lets Android offer/default to
 * that instead of a browser tab). Falls back to Browser.open() if the native call fails for any
 * reason (and is what runs on web, where ExternalOpen isn't available at all) — same visible
 * result as before, just without the PWA hand-off.
 */
export async function openMainApp(path = '/'): Promise<void> {
  const url = (await handoffUrl(path)) ?? mainAppUrl(path)
  if (Capacitor.isNativePlatform()) {
    try {
      await ExternalOpen.open({ url })
      return
    } catch {
      // falls through to Browser.open() below
    }
  }
  await Browser.open({ url })
}
