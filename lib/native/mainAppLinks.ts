import { Browser } from '@capacitor/browser'

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

export async function openMainApp(path = '/'): Promise<void> {
  await Browser.open({ url: mainAppUrl(path) })
}
