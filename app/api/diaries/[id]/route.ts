import { loadCamminoGroups } from '@/lib/cammini/diaryEntriesServer'
import { hiddenTappaActivityIds } from '@/lib/cammini/diaryEntries'
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { deletePercorsoCascade } from '@/lib/deletePercorsoCascade'
import { normalizeLabels } from '@/lib/diari/normalizeLabels'
import type { MetaType } from '@/lib/metaTypes'

export const dynamic = 'force-dynamic'

export interface DiarioReportageRow {
  /** activities.id */
  id: string
  title: string
  startTime: string
  distanceMeters: number
  elevationGain: number
  altitudeMax: number
  totalTimeSeconds: number
  routePolyline?: [number, number][]
  /** activities.trail_score — già cachato, nessun ricalcolo qui (stessa convenzione di sola
   *  lettura del resto di questa route). */
  trailScore: number | null
  userRating: number | null
  hasWrittenReport: boolean
  /** planned_hikes.id della Meta camminata — sempre presente per un Reportage creato dopo la
   *  ristrutturazione Diario/Mete (ActivityUploader.tsx collega sempre a una Meta, esistente o
   *  sintetica). Resta null solo per Reportage antecedenti l'introduzione dei Diari. */
  percorsoId: string | null
  /** activities.favorite — filtro "solo preferiti" del Sommario. */
  favorite: boolean
  /** "Travasato" dalla Meta al salvataggio (piano Blocco F §32) — determina se il Sommario mostra
   *  le metriche escursionistiche di questa riga o le omette (piano §48.9). */
  metaType: MetaType
  /** Dove apre la riga, se non è il resoconto dell'attività (la voce unica di un cammino apre il suo reportage). */
  href?: string
}

/** Una Meta di questo Diario senza ancora un Reportage — "in programma", la prima delle tre parti
 *  di una voce (docs/libreria-atlante-piano.md, Fase 4). Diverso da una riga dell'Atlante: qui
 *  `diaryId` è già valorizzato, la Meta è già "a casa" — l'Atlante non la mostra più (vedi il
 *  filtro `!diaryId` di app/atlante/salvate/page.tsx). */
export interface DiarioInProgrammaRow {
  /** planned_hikes.id */
  id: string
  title: string
  distanceMeters: number
  elevationGain: number
  routePolyline?: [number, number][]
  metaType: MetaType
  /** 'YYYY-MM-DD', null se non ancora data una data. */
  plannedDate: string | null
  createdAt: string
  trailScore: number | null
  /** planned_hikes.favorite — stesso filtro "solo preferiti" del tab Concluse, ora anche qui
   *  (tab "Programmate" del Sommario, richiesta esplicita dell'utente). */
  favorite: boolean
}

export interface DiarioDetail {
  id: string
  title: string
  subtitle: string
  /** Fase 14 — usato per riprodurre in miniatura l'effettiva copertina (DiarioCoverThumb) in
   *  cima al Sommario, non solo per /pubblica. */
  author: string
  isDefault: boolean
  coverUrl: string | null
  /** Etichette libere (Natura, Urbano, una zona…) — restyling pagina /diari, Fase 2 di
   *  docs/diari-restyling-piano.md. Modificate da qui (EtichetteDiarioEditor), non dal form di
   *  copertina/pubblicazione: sono metadati del registro, non della veste pubblica del Diario. */
  labels: string[]
  archivedAt: string | null
  reportage: DiarioReportageRow[]
  /** Le voci "in programma" di questo Diario — Fase 4 di docs/libreria-atlante-piano.md. Ordinate
   *  per plannedDate (le senza data in coda), poi per createdAt: le pagine di un Diario non si
   *  riordinano mai a mano, questo è l'unico ordine che esiste. */
  inProgramma: DiarioInProgrammaRow[]
}

// GET /api/diaries/[id] → il Diario e l'elenco dei suoi Reportage — ristrutturazione Diario/Mete
// richiesta esplicitamente dall'utente: un Diario contiene esclusivamente Reportage, mai Mete
// ancora senza uscita (quelle vivono in app/percorsi/page.tsx, trasversali a tutti i Diari). Un
// Reportage appartiene a QUESTO Diario indirettamente: activities non ha una colonna diary_id
// propria, l'appartenenza passa dalla Meta collegata (activities.linked_planned_id →
// planned_hikes.diary_id), coerente con components/upload/ActivityUploader.tsx che scrive
// diary_id sulla Meta proprio nel momento in cui nasce il Reportage.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: diary, error: diaryErr } = await supabase
      .from('diaries')
      .select('id, title, subtitle, author, is_default, cover_url, labels, archived_at')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()
    if (diaryErr || !diary) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: planned, error: plannedErr } = await supabase
      .from('planned_hikes')
      .select('id, title, distance_meters, elevation_gain, route_polyline, meta_type, planned_date, created_at, cached_trail_score, favorite')
      .eq('user_id', user.id)
      .eq('diary_id', params.id)
    if (plannedErr) throw plannedErr

    const plannedIds = (planned ?? []).map(p => p.id as string)

    let reportage: DiarioReportageRow[] = []
    // Le Mete di questo Diario già "camminate" (hanno un'activity collegata) — usato sotto per
    // separare inProgramma da reportage senza una seconda query: la stessa Meta non può stare in
    // entrambi gli elenchi.
    const walkedPlannedIds = new Set<string>()
    if (plannedIds.length > 0) {
      const { data: activities, error: activitiesErr } = await supabase
        .from('activities')
        .select('id, title, start_time, distance_meters, elevation_gain, altitude_max, total_time_seconds, route_polyline, trail_score, user_rating, favorite, linked_planned_id, meta_type')
        .eq('user_id', user.id)
        .in('linked_planned_id', plannedIds)
        .order('start_time', { ascending: false })
      if (activitiesErr) throw activitiesErr

      const activityIds = (activities ?? []).map(a => a.id as string)
      let reportedIds = new Set<string>()
      if (activityIds.length > 0) {
        const { data: reports, error: reportsErr } = await supabase
          .from('hike_reports')
          .select('activity_id')
          .eq('user_id', user.id)
          .in('activity_id', activityIds)
        if (reportsErr) throw reportsErr
        reportedIds = new Set((reports ?? []).map(r => r.activity_id as string))
      }

      reportage = (activities ?? []).map(a => ({
        id:               a.id as string,
        title:            a.title as string,
        startTime:        a.start_time as string,
        distanceMeters:   a.distance_meters as number,
        elevationGain:    a.elevation_gain as number,
        altitudeMax:      a.altitude_max as number,
        totalTimeSeconds: a.total_time_seconds as number,
        routePolyline:    a.route_polyline as [number, number][] | undefined,
        trailScore:       (a.trail_score as number | null) ?? null,
        userRating:       (a.user_rating as number | null) ?? null,
        hasWrittenReport: reportedIds.has(a.id as string),
        percorsoId:       (a.linked_planned_id as string | null) ?? null,
        favorite:         (a.favorite as boolean | null) ?? false,
        metaType:         (a.meta_type as MetaType) ?? 'sentiero',
      }))
      // Cammini: una sola riga per cammino (le tappe sono i capitoli del suo reportage), non una per tappa.
      const groups = await loadCamminoGroups(user.id, plannedIds)
      if (groups.length > 0) {
        const hidden = hiddenTappaActivityIds(groups)
        const byGroup = new Map(groups.map(g => [g.repActivityId, g]))
        reportage = reportage.flatMap(row => {
          if (hidden.has(row.id)) return []
          const g = byGroup.get(row.id)
          if (!g) return [row]
          const rows = (activities ?? []).filter(a => g.tappaActivityIds.includes(a.id as string))
            .sort((a, b) => new Date(a.start_time as string).getTime() - new Date(b.start_time as string).getTime())
          const sum = (k: 'distance_meters' | 'elevation_gain' | 'total_time_seconds') => rows.reduce((s, a) => s + ((a[k] as number) ?? 0), 0)
          const poly = rows.flatMap(a => (a.route_polyline as [number, number][] | null) ?? [])
          return [{
            ...row, id: `cammino:${g.hikeId}`, title: g.name, startTime: g.startTime,
            distanceMeters: sum('distance_meters'), elevationGain: sum('elevation_gain'), totalTimeSeconds: sum('total_time_seconds'),
            altitudeMax: Math.max(...rows.map(a => (a.altitude_max as number) ?? 0)),
            routePolyline: poly.length > 1 ? poly : undefined, trailScore: null, userRating: null,
            hasWrittenReport: !!g.content.trim(), percorsoId: g.hikeId, metaType: 'cammino' as MetaType,
            href: `/resoconto/cammino/${encodeURIComponent(g.hikeId)}`,
          }]
        })
      }
      for (const a of activities ?? []) {
        if (a.linked_planned_id) walkedPlannedIds.add(a.linked_planned_id as string)
      }
    }

    const inProgramma: DiarioInProgrammaRow[] = (planned ?? [])
      .filter(p => !walkedPlannedIds.has(p.id as string))
      .map(p => ({
        id:             p.id as string,
        title:          p.title as string,
        distanceMeters: p.distance_meters as number,
        elevationGain:  p.elevation_gain as number,
        routePolyline:  p.route_polyline as [number, number][] | undefined,
        metaType:       (p.meta_type as MetaType) ?? 'sentiero',
        plannedDate:    p.planned_date as string | null,
        createdAt:      p.created_at as string,
        trailScore:     (p.cached_trail_score as number | null) ?? null,
        favorite:       (p.favorite as boolean | null) ?? false,
      }))
      .sort((a, b) => (a.plannedDate ?? '9999-99-99').localeCompare(b.plannedDate ?? '9999-99-99') || a.createdAt.localeCompare(b.createdAt))

    const detail: DiarioDetail = {
      id:        diary.id as string,
      title:     diary.title as string,
      subtitle:  diary.subtitle as string,
      author:    diary.author as string,
      isDefault: diary.is_default as boolean,
      coverUrl:  diary.cover_url as string | null,
      labels:      (diary.labels as string[] | null) ?? [],
      archivedAt:  diary.archived_at as string | null,
      reportage,
      inProgramma,
    }
    return NextResponse.json(detail)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// PATCH /api/diaries/[id] { labels?: string[], archivedAt?: string | null } → metadati del
// registro (restyling pagina /diari, Fase 2 di docs/diari-restyling-piano.md) — separato dal
// contratto "sostituisci l'intera configurazione" di PATCH /api/diaries/[id]/config perché qui i
// campi si aggiornano uno alla volta (solo quelli presenti nel corpo), come già GET/PATCH
// /api/diaries/[id]/token per lo stesso motivo.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as {
      labels?: unknown; archivedAt?: unknown; shelfId?: unknown; shelfPosition?: unknown; title?: unknown; coverUrl?: unknown
    }
    const dbPatch: Record<string, unknown> = {}
    const hasShelfId = Object.prototype.hasOwnProperty.call(body, 'shelfId')
    const hasShelfPosition = Object.prototype.hasOwnProperty.call(body, 'shelfPosition')

    // Copertina del Diario — colonna diretta, come su collections (PATCH /api/collections/[id]),
    // invece di passare dal "sostituisci tutto" di PATCH /api/diaries/[id]/config: quel contratto
    // serve al form completo del libro impaginato, qui basta il solo campo (es. dal centro di
    // controllo /raccolte, che non conosce né deve conoscere il resto del DiaryConfig).
    if (Object.prototype.hasOwnProperty.call(body, 'coverUrl')) {
      if (body.coverUrl !== null && typeof body.coverUrl !== 'string') {
        return NextResponse.json({ error: 'coverUrl deve essere una stringa o null' }, { status: 400 })
      }
      dbPatch.cover_url = body.coverUrl
    }

    // Il nome del Diario (registro) — distinto dal titolo/sottotitolo di DiaryConfig, quello della
    // copertina del libro impaginato (/api/diaries/[id]/config): questo è il nome usato ovunque
    // nell'app (elenco Diari, etichetta del Diario su un Reportage, breadcrumb) e finora non era
    // modificabile da nessuna UI.
    if (Object.prototype.hasOwnProperty.call(body, 'title')) {
      if (typeof body.title !== 'string' || !body.title.trim()) {
        return NextResponse.json({ error: 'title deve essere una stringa non vuota' }, { status: 400 })
      }
      dbPatch.title = body.title.trim()
    }

    if (Object.prototype.hasOwnProperty.call(body, 'labels')) {
      if (!Array.isArray(body.labels) || !body.labels.every((l): l is string => typeof l === 'string')) {
        return NextResponse.json({ error: 'labels deve essere un array di stringhe' }, { status: 400 })
      }
      dbPatch.labels = normalizeLabels(body.labels)
    }

    if (Object.prototype.hasOwnProperty.call(body, 'archivedAt')) {
      if (body.archivedAt !== null && typeof body.archivedAt !== 'string') {
        return NextResponse.json({ error: 'archivedAt deve essere una stringa ISO o null' }, { status: 400 })
      }
      dbPatch.archived_at = body.archivedAt
    }

    if (Object.keys(dbPatch).length === 0 && !hasShelfId && !hasShelfPosition) {
      return NextResponse.json({ error: 'Nessun campo da aggiornare' }, { status: 400 })
    }

    // Il Diario di default non si archivia mai — stessa regola già in vigore per l'eliminazione
    // (DELETE sotto): deve sempre comparire nella pagina di atterraggio.
    if (typeof dbPatch.archived_at === 'string') {
      const { data: diary, error: diaryErr } = await supabase
        .from('diaries')
        .select('is_default')
        .eq('id', params.id)
        .eq('user_id', user.id)
        .maybeSingle()
      if (diaryErr) throw diaryErr
      if (!diary) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (diary.is_default) return NextResponse.json({ error: 'Il Diario di default non può essere archiviato' }, { status: 400 })
    }

    if (Object.keys(dbPatch).length > 0) {
      const { data, error } = await supabase
        .from('diaries')
        .update({ ...dbPatch, updated_at: new Date().toISOString() })
        .eq('id', params.id)
        .eq('user_id', user.id)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Sposta il Diario su un altro scaffale — drag & drop nel banner della Libreria
    // (docs/libreria-atlante-piano.md, Fase 1; ora una riga di collection_diaries invece di una
    // colonna su diaries, vedi supabase/migrations/merge_shelves_into_collections.sql). Un
    // Diario sta su un solo scaffale alla volta (UNIQUE(diary_id) sulla tabella): tolgo
    // l'eventuale riga precedente, qualunque fosse lo scaffale, prima di scrivere la nuova.
    if (hasShelfId) {
      if (typeof body.shelfId !== 'string') {
        return NextResponse.json({ error: 'shelfId deve essere una stringa' }, { status: 400 })
      }
      const { data: shelf, error: shelfErr } = await supabase
        .from('collections')
        .select('id')
        .eq('id', body.shelfId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (shelfErr) throw shelfErr
      if (!shelf) return NextResponse.json({ error: 'Scaffale non trovato' }, { status: 404 })

      const position = hasShelfPosition && typeof body.shelfPosition === 'number' && Number.isFinite(body.shelfPosition)
        ? body.shelfPosition
        : 0

      const { error: delErr } = await supabase
        .from('collection_diaries')
        .delete()
        .eq('diary_id', params.id)
        .eq('user_id', user.id)
      if (delErr) throw delErr

      const { error: insErr } = await supabase
        .from('collection_diaries')
        .insert({ collection_id: body.shelfId, diary_id: params.id, user_id: user.id, position })
      if (insErr) throw insErr
    } else if (hasShelfPosition) {
      // Riordino dentro lo stesso scaffale, senza cambiarlo (drag&drop fra due Diari già vicini).
      if (typeof body.shelfPosition !== 'number' || !Number.isFinite(body.shelfPosition)) {
        return NextResponse.json({ error: 'shelfPosition deve essere un numero' }, { status: 400 })
      }
      const { data, error } = await supabase
        .from('collection_diaries')
        .update({ position: body.shelfPosition })
        .eq('diary_id', params.id)
        .eq('user_id', user.id)
        .select('diary_id')
        .maybeSingle()
      if (error) throw error
      if (!data) return NextResponse.json({ error: 'Questo Diario non è ancora su nessuno scaffale' }, { status: 404 })
    }

    const [{ data: diaryRow, error: diaryReadErr }, { data: shelfRow, error: shelfReadErr }] = await Promise.all([
      supabase.from('diaries').select('title, labels, archived_at, cover_url').eq('id', params.id).eq('user_id', user.id).maybeSingle(),
      supabase.from('collection_diaries').select('collection_id, position').eq('diary_id', params.id).eq('user_id', user.id).maybeSingle(),
    ])
    if (diaryReadErr) throw diaryReadErr
    if (shelfReadErr) throw shelfReadErr
    if (!diaryRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    return NextResponse.json({
      title:         diaryRow.title as string,
      labels:        (diaryRow.labels as string[] | null) ?? [],
      archivedAt:    diaryRow.archived_at as string | null,
      coverUrl:      (diaryRow.cover_url as string | null) ?? null,
      shelfId:       (shelfRow?.collection_id as string | undefined) ?? null,
      shelfPosition: (shelfRow?.position as number | undefined) ?? 0,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// DELETE /api/diaries/[id]?action=migrate|deleteAll → Fase 6 di docs/diario-fulcro-piano.md. Mai
// un default silenzioso: l'utente sceglie esplicitamente se i Percorsi del Diario passano al
// Diario di default ('migrate') o vengono eliminati con tutti i loro Reportage ('deleteAll'). Il
// Diario di default stesso non è mai eliminabile da qui.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const action = req.nextUrl.searchParams.get('action')
    if (action !== 'migrate' && action !== 'deleteAll') {
      return NextResponse.json({ error: 'action deve essere "migrate" o "deleteAll"' }, { status: 400 })
    }

    const { data: diary, error: diaryErr } = await supabase
      .from('diaries')
      .select('id, is_default')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (diaryErr) throw diaryErr
    if (!diary) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (diary.is_default) return NextResponse.json({ error: 'Il Diario di default non può essere eliminato' }, { status: 400 })

    if (action === 'migrate') {
      const { data: defaultDiary, error: defaultErr } = await supabase
        .from('diaries')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_default', true)
        .maybeSingle()
      if (defaultErr) throw defaultErr
      if (!defaultDiary) return NextResponse.json({ error: 'Diario di default non trovato' }, { status: 500 })

      const { error: moveErr } = await supabase
        .from('planned_hikes')
        .update({ diary_id: defaultDiary.id })
        .eq('user_id', user.id)
        .eq('diary_id', params.id)
      if (moveErr) throw moveErr
    } else {
      const { data: percorsi, error: percorsiErr } = await supabase
        .from('planned_hikes')
        .select('id')
        .eq('user_id', user.id)
        .eq('diary_id', params.id)
      if (percorsiErr) throw percorsiErr
      for (const p of percorsi ?? []) {
        await deletePercorsoCascade(user.id, p.id as string)
      }
    }

    // Copertina e PDF del Diario (percorso deterministico, vedi lib/diaryCoverUpload.ts e
    // lib/pdfUpload.ts) — nessun errore se non sono mai esistiti.
    await supabase.storage.from('dtrek-photos').remove([`${user.id}/diaries/${params.id}/diary-cover.jpg`])
    await supabase.storage.from('dtrek-reports').remove([`${user.id}/diaries/${params.id}/diary.pdf`])

    const { error: deleteErr } = await supabase
      .from('diaries')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id)
    if (deleteErr) throw deleteErr

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
