import { registerPlugin } from '@capacitor/core'

/**
 * TS surface of the Android `ExternalOpen` Capacitor plugin
 * (android/app/src/main/java/com/dtrek/navigator/externalopen) — a plain `Intent.ACTION_VIEW`,
 * used instead of `@capacitor/browser`'s Custom Tabs specifically so Android's normal app-link
 * resolution can hand off to Dtrek's installed PWA when present (see lib/native/mainAppLinks.ts).
 * Only exists on native platforms — on web `registerPlugin` returns a proxy whose methods reject,
 * which is why mainAppLinks.ts guards every call with `Capacitor.isNativePlatform()`.
 */
export interface ExternalOpenPlugin {
  open(options: { url: string }): Promise<{ opened: boolean }>
}

const ExternalOpen = registerPlugin<ExternalOpenPlugin>('ExternalOpen')

export default ExternalOpen
