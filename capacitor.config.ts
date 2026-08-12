import type { CapacitorConfig } from '@capacitor/cli'

// Dtrek è un'app Next.js server-rendered (API routes, middleware di auth,
// SSR) e non un sito statico esportabile: la shell nativa Android non
// impacchetta un `webDir` statico, ma carica la PWA esistente via HTTPS
// (`server.url`), esattamente come richiesto dalla issue — "la PWA/Next.js
// rimane l'interfaccia principale". Il bridge Capacitor viene comunque
// iniettato nella WebView, e i plugin nativi (NativeLocation in primis)
// restano disponibili alla pagina web caricata da remoto.
//
// In sviluppo punta al server Next.js locale (vedi `npm run dev` + un device
///emulatore sulla stessa rete, o `adb reverse tcp:3000 tcp:3000`); in
// produzione punta al dominio pubblico dell'app.
const devServerUrl = process.env.CAPACITOR_SERVER_URL

const config: CapacitorConfig = {
  appId: 'com.dtrek.app',
  appName: 'DTrek',
  webDir: 'public',
  server: {
    androidScheme: 'https',
    ...(devServerUrl ? { url: devServerUrl, cleartext: devServerUrl.startsWith('http://') } : {}),
  },
  android: {
    // Le richieste HTTPS verso il backend Dtrek stesso passano già per
    // `server.url`; nient'altro deve essere raggiungibile in cleartext.
    allowMixedContent: false,
  },
}

export default config
