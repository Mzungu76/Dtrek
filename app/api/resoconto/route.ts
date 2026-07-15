import { NextRequest } from 'next/server'
import Anthropic        from '@anthropic-ai/sdk'
import { supabase }     from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'
import { formatDuration, type TrackPoint } from '@/lib/tcxParser'
import { format }            from 'date-fns'
import { it }                from 'date-fns/locale'
import { sectionsToMarkdown, type ReportSection } from '@/lib/reportStore'
import type { PoiItem }      from '@/lib/overpass'
import type { WikiPage }     from '@/lib/wikipedia'
import { fetchNatureContext, formatNatureContextBlock, type NatureContext } from '@/lib/aiNatureContext'
import { DEFAULT_CLAUDE_MODEL, isValidClaudeModelId } from '@/lib/claudeModels'
import { tryAcquireCooldown } from '@/lib/aiCooldown'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

type ResocontoLength = 'breve' | 'media' | 'lunga'

const LENGTH_CONFIG: Record<ResocontoLength, { maxTokens: number; instruction: string }> = {
  breve: {
    maxTokens: 1800,
    instruction: 'Scrivi in modo conciso: 2-3 paragrafi per sezione, massimo 150 parole per sezione.',
  },
  media: {
    maxTokens: 6000,
    instruction: 'Scrivi con buon equilibrio di dettagli: 3-4 paragrafi per sezione, circa 300 parole per sezione.',
  },
  lunga: {
    maxTokens: 10000,
    instruction: 'Scrivi con grande ricchezza di dettagli: 5-6 paragrafi per sezione, circa 500 parole per sezione.',
  },
}

const SYSTEM = `Sei un giornalista outdoor di punta, specializzato in reportage escursionistici per riviste come Meridiani Montagne e National Geographic Traveller Italia.
Hai una solida formazione in geografia, storia naturale e medicina dello sport, che usi per arricchire ogni articolo con dati precisi e contesto culturale profondo.

Il tuo stile è autorevole ma accessibile: come un corrispondente dal campo, descrivi l'escursione in terza persona con tono oggettivo ma evocativo.
Usa i dati biometrici (frequenza cardiaca, calorie, passo) come elementi narrativi che raccontano lo sforzo fisico.
Integra i dati di percorso con riferimenti storici, geologici e naturalistici tratti dalla guida disponibile.
Descrivi le fotografie scattate lungo il percorso come dispacci visivi: cosa immortalano, a che punto del cammino, cosa rivelano del territorio.

Per i titoli delle sezioni usa ## (due cancelletti seguiti da spazio). Non usare asterischi per il grassetto.
Non usare bullet point: preferisci narrazione fluida e densa di dettagli.
Per curiosità, fatti insoliti o dati sorprendenti, racchiudili in: [curiosita] testo [/curiosita]

Se nel materiale fornito trovi risposte dell'escursionista a un questionario guidato, la sezione "## Cronaca" va scritta in PRIMA PERSONA (io/ho raggiunto/mi sono fermato), come se fosse l'escursionista stesso a raccontare: assorbi il contenuto e il tono emotivo delle risposte e fondili nella narrazione, mantenendo l'ordine cronologico dei punti del percorso a cui si riferiscono. NON riportarle mai come citazioni testuali né tra virgolette. Le altre sezioni restano in terza persona oggettiva come il resto del reportage — è uno stile volutamente misto: cronaca personale dentro un reportage giornalistico.
Se invece non trovi risposte a un questionario, NON scrivere affatto la sezione "## Cronaca": il reportage in quel caso ha solo tre sezioni.`

interface PhotoMeta {
  caption: string
  lat?: number
  lon?: number
  progress: number
  hasExifGps?: boolean
}

interface QaItem {
  question:    string
  anchorLabel: string
  answer:      string
  isFreeWrite: boolean
}

interface QuestionnaireQuestionRow {
  id: string
  question: string
  label: string
  progress: number
  isFreeWrite?: boolean
}

interface QuestionnaireAnswerRow {
  text: string
  skipped: boolean
}

function poiDistance(m: number) {
  return m < 1000 ? `${m.toFixed(0)} m dal percorso` : `${(m / 1000).toFixed(1)} km dal percorso`
}

function buildPoiBlock(cachedPois?: PoiItem[], cachedPoiWiki?: { poi: PoiItem; wiki: WikiPage }[]): string {
  const wiki = cachedPoiWiki ?? []
  const raw  = cachedPois    ?? []

  const wikiBlock = wiki.length > 0
    ? wiki.map(({ poi, wiki: w }) =>
        `• ${w.title} [${poi.type}${poi.ele ? `, ${poi.ele} m slm` : ''}, ${poiDistance(poi.distFromTrack)}]\n  ${(w.extract ?? '').slice(0, 400)}`,
      ).join('\n\n')
    : ''

  const rawOnly = raw
    .filter(p => !wiki.some(e => e.poi.id === p.id) && p.name)
    .slice(0, 10)
    .map(p => `• ${p.name} [${p.type}${p.ele ? `, ${p.ele} m` : ''}]`)
    .join('\n')

  if (!wikiBlock && !rawOnly) return ''
  return [wikiBlock, rawOnly && `ALTRI PUNTI DI INTERESSE OSM:\n${rawOnly}`].filter(Boolean).join('\n\n')
}

function buildQa(questions: QuestionnaireQuestionRow[], answers: Record<string, QuestionnaireAnswerRow>): QaItem[] {
  return questions
    .filter(q => answers[q.id] && !answers[q.id].skipped && answers[q.id].text?.trim())
    .sort((a, b) => a.progress - b.progress)
    .map(q => ({
      question:    q.question,
      anchorLabel: q.label,
      answer:      answers[q.id].text,
      isFreeWrite: !!q.isFreeWrite,
    }))
}

function buildPrompt(
  activity: Record<string, unknown>,
  length: ResocontoLength,
  photos: PhotoMeta[],
  guideText?: string,
  qa?: QaItem[],
  poiBlock?: string,
  nature?: NatureContext,
): string {
  const dateStr = activity.start_time
    ? format(new Date(activity.start_time as string), "EEEE d MMMM yyyy", { locale: it })
    : null

  // Biometric data
  const avgHR  = activity.avg_heart_rate  as number | undefined
  const maxHR  = activity.max_heart_rate  as number | undefined
  const avgSpd = activity.avg_speed_ms    as number | undefined
  const cal    = activity.calories        as number | undefined
  const biometricBlock = [
    avgHR  && avgHR  > 0 ? `FC MEDIA: ${Math.round(avgHR)} bpm` : '',
    maxHR  && maxHR  > 0 ? `FC MASSIMA: ${Math.round(maxHR)} bpm` : '',
    avgSpd && avgSpd > 0 ? `VELOCITÀ MEDIA: ${(avgSpd * 3.6).toFixed(1)} km/h` : '',
    cal    && cal    > 0 ? `CALORIE BRUCIATE: ${cal} kcal` : '',
  ].filter(Boolean).join('\n')

  // Photos sorted start→end (progress 0.0 → 1.0)
  const sortedPhotos = [...photos].sort((a, b) => a.progress - b.progress)
  function progressLabel(p: number): string {
    if (p < 0.15) return 'alla partenza'
    if (p < 0.4)  return 'nel primo tratto del percorso'
    if (p < 0.65) return 'a metà percorso'
    if (p < 0.85) return 'nel tratto finale'
    return 'quasi all\'arrivo'
  }

  // Distinguish positioned photos (GPS or manually placed) from unpositioned ones
  const positionedPhotos = sortedPhotos.filter(p => p.hasExifGps || p.progress !== 0.5)
  const genericPhotos    = sortedPhotos.filter(p => !p.hasExifGps && p.progress === 0.5)

  const positionedBlock = positionedPhotos.length > 0
    ? positionedPhotos.map((p, i) =>
        `• Foto ${i + 1}: "${p.caption}" — ${progressLabel(p.progress)}${p.hasExifGps && p.lat && p.lon ? ` (GPS: ${p.lat.toFixed(4)}°N, ${p.lon.toFixed(4)}°E)` : ''}`,
      ).join('\n')
    : ''

  const genericBlock = genericPhotos.length > 0
    ? genericPhotos.map(p => `• "${p.caption}" (galleria generica, posizione non definita)`).join('\n')
    : ''

  const photoBlock = sortedPhotos.length > 0
    ? [
        positionedBlock && `Foto georeferenziate sul percorso:\n${positionedBlock}`,
        genericBlock    && `Foto senza posizione (galleria generica):\n${genericBlock}`,
      ].filter(Boolean).join('\n\n')
    : '(nessun materiale fotografico)'

  const guideBlock = guideText
    ? `\nCONTESTO STORICO-NATURALISTICO (estratto dalla guida del percorso — usalo come fonte per approfondimenti):\n${guideText.slice(0, 2500)}\n`
    : ''

  const poiSection = poiBlock
    ? `\nPUNTI DI INTERESSE LUNGO IL PERCORSO:\n${poiBlock}\n`
    : ''

  const natureBlock = nature ? formatNatureContextBlock(nature) : ''
  const natureSection = natureBlock
    ? `\nDATI NATURALISTICI E FENOLOGICI REALI (usa questi dati per la sezione "Natura e storia" — non inventare flora/fauna in contraddizione con questi dati):\n${natureBlock}\n`
    : ''

  const qaBlock = qa && qa.length > 0
    ? `\nRISPOSTE DELL'ESCURSIONISTA AL QUESTIONARIO GUIDATO (in ordine cronologico lungo il percorso — usa solo per assorbirne contenuto e tono, non riportarle alla lettera né tra virgolette):\n${
        qa.map(item =>
          `• [${item.anchorLabel}]${item.isFreeWrite ? ' (racconto libero dell\'escursionista)' : ''} — alla domanda "${item.question}" ha risposto: ${item.answer}`,
        ).join('\n')
      }\n`
    : ''

  const hasQa = !!(qa && qa.length > 0)
  const cronacaBlock = hasQa
    ? `
## Cronaca
Racconta in PRIMA PERSONA la progressione dell'escursione dall'inizio alla fine in ordine cronologico,
come se fosse l'escursionista stesso a raccontare. Integra le fotografie scattate come elementi della
narrazione: cosa mostrano, in quale tratto del percorso, cosa aggiungono alla comprensione dei luoghi.
Eventuali dati biometrici possono essere citati qui se aiutano a descrivere il ritmo o la fatica.
Integra le risposte dell'escursionista al questionario guidato, seguendo l'ordine cronologico dei punti
del percorso a cui si riferiscono, fondendole nella narrazione senza mai citarle alla lettera.
`
    : ''

  return `Scrivi un reportage giornalistico di questa escursione per una rivista outdoor italiana di qualità:

TITOLO ESCURSIONE: ${activity.title ?? 'Escursione'}
${dateStr ? `DATA: ${dateStr}` : ''}

DATI DEL PERCORSO:
DISTANZA: ${((activity.distance_meters as number) / 1000).toFixed(1)} km
DISLIVELLO POSITIVO: ${Math.round(activity.elevation_gain as number)} m
DISLIVELLO NEGATIVO: ${Math.round((activity.elevation_loss as number) ?? 0)} m
DURATA EFFETTIVA: ${formatDuration(activity.total_time_seconds as number)}
${(activity.altitude_max as number) > 0 ? `QUOTA MASSIMA RAGGIUNTA: ${Math.round(activity.altitude_max as number)} m slm` : ''}
${biometricBlock ? `\nDATI DI RIFERIMENTO (usa solo se rilevanti, non come sezione separata):\n${biometricBlock}` : ''}
${activity.user_notes ? `\nNOTE DELL'ESCURSIONISTA:\n${activity.user_notes}` : ''}
${guideBlock}
${poiSection}
${natureSection}
${qaBlock}
DOCUMENTAZIONE FOTOGRAFICA (in ordine cronologico dal punto di partenza):
${photoBlock}

Scrivi il reportage strutturato in queste ${hasQa ? 'quattro' : 'tre'} sezioni (usa ## per ogni titolo):

## Il percorso
Descrivi il tracciato e il territorio attraversato: paesaggio, morfologia del terreno,
punti panoramici, cambi di vegetazione. Contestualizza geograficamente il percorso
senza usare toni enfatici. Usa i dati di distanza, dislivello e quota come ancoraggio.
${cronacaBlock}
## Natura e storia
Approfondisci i luoghi attraversati: geologia, flora, fauna, siti storici o
archeologici nelle vicinanze, tradizioni locali. Includi almeno un fatto poco noto
che arricchisca la conoscenza del territorio.${natureBlock ? ' Fonda la parte naturalistica sui DATI NATURALISTICI E FENOLOGICI REALI forniti sopra (specie osservate, tipo di bosco, fenologia satellitare).' : ''}${poiBlock ? ' Usa i PUNTI DI INTERESSE forniti sopra per la parte storico-culturale.' : ''}

## In sintesi
Valutazione complessiva: difficoltà effettiva, qualità del contesto, periodo ideale,
consigli pratici. Una o due frasi conclusive che catturino l'essenza dell'esperienza.

${positionedPhotos.length > 0 ? `Quando fai riferimento a una foto geolocalizzata, usa il suo numero (es. "nella foto 1", "lo scatto 3 mostra"). Le foto della galleria generica possono essere citate per nome senza posizione nel percorso.` : ''}
Scrivi in italiano preciso, diretto, senza aggettivi inflazionati o toni epici.

LUNGHEZZA: ${LENGTH_CONFIG[length].instruction}

IMPORTANTE: Completa obbligatoriamente tutte e ${hasQa ? 'quattro le sezioni' : 'tre le sezioni'}${hasQa ? '' : ' (NON scrivere "## Cronaca")'}.`

}


// ── GET — fetch existing report ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Non autenticato' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  // ?all=true → return all reports for the user with joined activity stats
  if (req.nextUrl.searchParams.get('all') === 'true') {
    const { data: reports, error } = await supabase
      .from('hike_reports')
      .select('id, activity_id, title, content, created_at, updated_at, share_token, authored_by')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })

    const activityIds = (reports ?? []).map((r: Record<string, unknown>) => r.activity_id as string).filter(Boolean)
    const { data: activities } = activityIds.length
      ? await supabase.from('activities').select('id, title, start_time, distance_meters, total_time_seconds, elevation_gain, weather_at_hike').in('id', activityIds)
      : { data: [] }

    const actMap = new Map((activities ?? []).map((a: Record<string, unknown>) => [a.id, a]))
    const enriched = (reports ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      activity: actMap.get(r.activity_id as string) ?? null,
    }))
    return new Response(JSON.stringify(enriched), { headers: { 'Content-Type': 'application/json' } })
  }

  const activityId = req.nextUrl.searchParams.get('activityId')
  if (!activityId) {
    return new Response(JSON.stringify({ error: 'activityId mancante' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data, error } = await supabase
    .from('hike_reports')
    .select('id, activity_id, title, content, photos, created_at, updated_at, sections, authored_by')
    .eq('activity_id', activityId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify(data ?? null), {
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── POST — generate (streaming) + save ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Non autenticato' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('claude_api_key, subscription_tier, claude_model')
    .eq('user_id', user.id)
    .maybeSingle()

  const userKey = settings?.claude_api_key as string | null | undefined
  const hasSub  = (settings?.subscription_tier as string) === 'premium'
  const apiKey  = userKey ?? (hasSub ? process.env.ANTHROPIC_API_KEY : null)
  const claudeModel = isValidClaudeModelId(settings?.claude_model) ? settings.claude_model : DEFAULT_CLAUDE_MODEL

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error:   'no_ai_access',
        message: 'Aggiungi la tua chiave API Claude nelle impostazioni per generare il resoconto.',
      }),
      { status: 402, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let activityId: string
  let length: ResocontoLength = 'media'
  let photos: PhotoMeta[] = []
  try {
    const body = await req.json()
    activityId = body.activityId
    if (!activityId) throw new Error('activityId mancante')
    if (body.length && ['breve', 'media', 'lunga'].includes(body.length)) {
      length = body.length as ResocontoLength
    }
    if (Array.isArray(body.photos)) photos = body.photos
  } catch (e) {
    console.error('[api/resoconto] POST: body non valido:', e)
    return new Response(JSON.stringify({ error: 'Body non valido' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Rete di sicurezza economica contro click ripetuti in sequenza sulla generazione del resoconto —
  // vedi lib/aiCooldown.ts. Per attività, non per utente: ogni riga activities appartiene già a un
  // solo utente, quindi coincide con lo stesso effetto.
  if (!(await tryAcquireCooldown('resoconto', activityId))) {
    return new Response(
      JSON.stringify({
        error:   'cooldown',
        message: 'Hai appena generato questo resoconto — aspetta qualche secondo prima di rigenerarlo.',
      }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const { data: activity, error: actErr } = await supabase
    .from('activities')
    .select('*')
    .eq('id', activityId)
    .eq('user_id', user.id)
    .single()

  if (actErr || !activity) {
    return new Response(JSON.stringify({ error: 'Attività non trovata' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    })
  }

  let guideText: string | undefined
  let poiBlock: string | undefined
  let s2: Record<string, unknown> | undefined
  if (activity.linked_planned_id) {
    const { data: hike } = await supabase
      .from('planned_hikes')
      .select('cached_guide, cached_pois, cached_poi_wiki, s2_available, s2_phenology_peak_month, s2_ndvi_delta, s2_landscape_variety, s2_shade_score, s2_water_sources')
      .eq('id', activity.linked_planned_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (hike?.cached_guide) guideText = hike.cached_guide
    if (hike) {
      poiBlock = buildPoiBlock(hike.cached_pois, hike.cached_poi_wiki)
      s2 = hike
    }
  }

  const track: TrackPoint[] = Array.isArray(activity.track_points) ? activity.track_points : []
  const nature = await fetchNatureContext({
    trackPoints: track,
    altitudeMax: activity.altitude_max as number | undefined,
    month: activity.start_time ? new Date(activity.start_time as string).getMonth() + 1 : new Date().getMonth() + 1,
    s2: s2 ? {
      available:          s2.s2_available as boolean | undefined,
      phenologyPeakMonth:  s2.s2_phenology_peak_month as number | null,
      ndviDelta:           s2.s2_ndvi_delta as number | null,
      landscapeVariety:    s2.s2_landscape_variety as number | null,
      shadeScore:          s2.s2_shade_score as number | null,
      waterSources:        s2.s2_water_sources as unknown[] | null,
    } : undefined,
  })

  let qa: QaItem[] | undefined
  const { data: questionnaire } = await supabase
    .from('hike_questionnaires')
    .select('questions, answers')
    .eq('activity_id', activityId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (questionnaire) {
    const questions = (questionnaire.questions as QuestionnaireQuestionRow[]) ?? []
    const answers   = (questionnaire.answers   as Record<string, QuestionnaireAnswerRow>) ?? {}
    const built = buildQa(questions, answers)
    if (built.length > 0) qa = built
  }

  const client  = new Anthropic({ apiKey })
  const prompt  = buildPrompt(activity, length, photos, guideText, qa, poiBlock, nature)
  const { maxTokens } = LENGTH_CONFIG[length]

  let fullText = ''

  const aiStream = client.messages.stream({
    model:      claudeModel,
    max_tokens: maxTokens,
    system:     SYSTEM,
    messages:   [{ role: 'user', content: prompt }],
  })

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of aiStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const text = event.delta.text
            fullText += text
            controller.enqueue(new TextEncoder().encode(text))
          }
        }
        // Upsert BEFORE closing so the async work completes within stream lifetime
        try {
          const reportId  = `report-${activityId}`
          const photoMeta = photos.map(({ caption, lat, lon, progress }) => ({ caption, lat, lon, progress }))
          await supabase.from('hike_reports').upsert(
            {
              id:          reportId,
              user_id:     user.id,
              activity_id: activityId,
              title:       (activity.title as string) ?? 'Escursione',
              content:     fullText,
              photos:      photoMeta,
              authored_by: 'ai',
              sections:    null,
              updated_at:  new Date().toISOString(),
            },
            { onConflict: 'id' },
          )
        } catch { /* save errors are non-fatal — content was already streamed */ }

        controller.close()
      } catch (e) {
        controller.error(e)
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type':     'text/plain; charset=utf-8',
      'Cache-Control':    'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}

// ── PATCH — autosave edited content ────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Non autenticato' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  let activityId: string, content: string
  let sections: ReportSection[] | undefined
  let authoredBy: string | undefined
  try {
    const body = await req.json()
    activityId = body.activityId
    content    = body.content
    if (Array.isArray(body.sections)) sections = body.sections as ReportSection[]
    if (typeof body.authoredBy === 'string') authoredBy = body.authoredBy
    if (!activityId || content === undefined) throw new Error()
  } catch (e) {
    console.error('[api/resoconto] PATCH: body non valido:', e)
    return new Response(JSON.stringify({ error: 'Body non valido' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const update: Record<string, unknown> = {
    content:    sections ? sectionsToMarkdown(sections) : content,
    updated_at: new Date().toISOString(),
  }
  if (sections) update.sections = sections
  if (authoredBy) update.authored_by = authoredBy

  // hike_reports.title is NOT NULL — resolve a fallback so the upsert can't
  // fail on INSERT when no report row exists yet (e.g. a brand-new manual
  // report that was never AI-generated first).
  const { data: existingReport } = await supabase
    .from('hike_reports')
    .select('title')
    .eq('id', `report-${activityId}`)
    .maybeSingle()

  if (!existingReport?.title) {
    const { data: act } = await supabase
      .from('activities')
      .select('title')
      .eq('id', activityId)
      .eq('user_id', user.id)
      .maybeSingle()
    update.title = (act?.title as string) ?? 'Escursione'
  }

  const { error } = await supabase
    .from('hike_reports')
    .upsert(
      { id: `report-${activityId}`, user_id: user.id, activity_id: activityId, ...update },
      { onConflict: 'id' },
    )

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
}
