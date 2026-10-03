// I link di approfondimento del catalogo dei cammini religiosi del Ministero del Turismo sono inseriti a mano e a volte
// sbagliati (es. "https://https//sito.org", spazi codificati in coda). Si correggono gli errori di battitura evidenti; un
// indirizzo che non diventa un URL http(s) valido viene scartato, mai indovinato.

export function normalizeSiteUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  let s = raw.trim().replace(/^(%20|\s)+/g, '').replace(/(%20|\s)+(?=\/|$)/g, '')
  s = s.replace(/^(https?:\/\/)(https?:?\/\/?)/i, '$1').replace(/^(https?):\/(?!\/)/i, '$1://')
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`
  try {
    const u = new URL(s)
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname.includes('.')) return null
    return u.toString()
  } catch { return null }
}
