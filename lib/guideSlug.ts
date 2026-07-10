/** Slug per l'id di un heading "### Nome" dentro il corpo di una sezione — usato sia per generare
 *  l'ancora (MagazineBody) sia per fare scroll-to-POI dalla mappa/lista POI (GuideReader). */
export function slugifyHeading(text: string): string {
  return 'poi-heading-' + text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
