import type { CapacitorConfig } from '@capacitor/cli'

// This native shell is DTrek Navigator — a separate, standalone install from
// the main DTrek app (which stays web/PWA-only, no Capacitor wrapper). See
// docs/navigation-engine-analysis.md ("Architettura a due app") for why:
// navigation with a real background GPS/foreground-service is an optional,
// permission-heavy feature most Dtrek users never need, so it ships as its
// own Play Store / App Store listing instead of forcing it on everyone who
// installs the main app. Both apps talk to the same Supabase project and
// the same Next.js deployment — an independent login in each app (same
// account) is enough for them to see the same data; there is no bespoke
// app-to-app sync layer.
//
// Dtrek itself is a server-rendered Next.js app (API routes, auth
// middleware, SSR), not a static site: this shell does not bundle a static
// `webDir`, it loads the existing deployment over HTTPS (`server.url`), just
// scoped to this app's own entry route instead of the whole site — see
// `app/navigatore/page.tsx`, the minimal "pick a planned route, start
// navigating" screen that is this app's entire surface.
//
// In sviluppo punta al server Next.js locale (vedi `npm run dev` + un
// device/emulatore sulla stessa rete, o `adb reverse tcp:3000 tcp:3000`);
// in produzione punta al dominio pubblico dell'app. Se l'URL passato non ha
// già un path esplicito, viene aggiunto automaticamente `/navigatore`.
const NAVIGATOR_ENTRY_PATH = '/navigatore'

function resolveServerUrl(): string | undefined {
  const base = process.env.CAPACITOR_SERVER_URL
  if (!base) return undefined
  try {
    const url = new URL(base)
    if (url.pathname === '' || url.pathname === '/') url.pathname = NAVIGATOR_ENTRY_PATH
    return url.toString()
  } catch {
    return base
  }
}

const serverUrl = resolveServerUrl()

// Same dark shell color as the native launch theme (android/app/src/main/res/values/styles.xml,
// AppTheme.NoActionBarLaunch → @drawable/splash) and the in-page splash overlay
// (components/SplashScreen.tsx, bg-[#0b1a24]) — this is the WebView's OWN background, painted
// the instant it's created, well before the remote `/navigatore` page (server.url above) has
// actually arrived over the network. Without it the WebView defaults to plain white, so on a slow
// connection the native splash gets replaced by a white screen for however long the page takes to
// load instead of a continuous dark screen until real content paints over it.
const SHELL_BACKGROUND_COLOR = '#0b1a24'

const config: CapacitorConfig = {
  appId: 'com.dtrek.navigator',
  appName: 'DTrek Navigator',
  webDir: 'public',
  backgroundColor: SHELL_BACKGROUND_COLOR,
  server: {
    androidScheme: 'https',
    ...(serverUrl ? { url: serverUrl, cleartext: serverUrl.startsWith('http://') } : {}),
  },
  android: {
    // Le richieste HTTPS verso il backend Dtrek stesso passano già per
    // `server.url`; nient'altro deve essere raggiungibile in cleartext.
    allowMixedContent: false,
    backgroundColor: SHELL_BACKGROUND_COLOR,
  },
}

export default config
