import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getUserFromRequest } from '@/lib/supabaseAuth'

export const dynamic = 'force-dynamic'

// GET /api/diary-token → diary_pdf_url + diary_token for the authenticated user
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('user_settings')
      .select('diary_pdf_url, diary_token')
      .eq('user_id', user.id)
      .single()
    if (error || !data) return NextResponse.json({ diary_pdf_url: null, diary_token: null })
    return NextResponse.json({
      diary_pdf_url: (data.diary_pdf_url as string) ?? null,
      diary_token:   (data.diary_token as string)   ?? null,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// PATCH /api/diary-token { diaryPdfUrl? } → assicura un diary_token, e SOLO se il corpo contiene
// `diaryPdfUrl` aggiorna anche l'URL del PDF.
//
// La distinzione è il motivo per cui la condivisione ora funziona. Prima la chiave era sempre
// scritta: chiamare la PATCH senza URL azzerava `diary_pdf_url`, quindi l'unico modo di ottenere
// un link era passare da un upload riuscito — e `fetchPublicDiary` a sua volta pretendeva quel
// campo non nullo. Le due cose insieme rendevano la condivisione impossibile finché un file da
// decine di MB non arrivava a destinazione da un telefono.
//
// Ora «Pubblica link» chiama questa PATCH con corpo vuoto: ottiene il token, la pagina pubblica è
// subito viva, e un eventuale PDF pubblicato in seguito si aggiunge senza toccare il link.
export async function PATCH(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Corpo assente o non-JSON: trattato come «assicura solo il token», non come «azzera il PDF».
    const body = await req.json().catch(() => ({})) as { diaryPdfUrl?: string | null }
    const touchesPdf = Object.prototype.hasOwnProperty.call(body, 'diaryPdfUrl')

    const { data: existing } = await supabase
      .from('user_settings')
      .select('user_id, diary_token, diary_pdf_url')
      .eq('user_id', user.id)
      .maybeSingle()

    // Keep existing diary_token or generate a new UUID
    const token = (existing?.diary_token as string | null) ?? crypto.randomUUID()
    const pdfUrl = touchesPdf
      ? (body.diaryPdfUrl ?? null)
      : ((existing?.diary_pdf_url as string | null) ?? null)

    if (existing) {
      const { error } = await supabase
        .from('user_settings')
        .update(touchesPdf ? { diary_pdf_url: pdfUrl, diary_token: token } : { diary_token: token })
        .eq('user_id', user.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('user_settings')
        .insert({ user_id: user.id, diary_pdf_url: pdfUrl, diary_token: token })
      if (error) throw error
    }
    return NextResponse.json({ ok: true, diary_pdf_url: pdfUrl, diary_token: token })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE /api/diary-token → revoke the diary public PDF link for real.
//
// La versione precedente azzerava solo `diary_pdf_url`, lasciando il file sullo Storage bucket
// pubblico a un percorso deterministico (`${userId}/diary.pdf`, vedi lib/pdfUpload.ts) e senza
// ruotare `diary_token` — quindi il PDF restava raggiungibile a chiunque ne avesse già l'URL
// diretto, e il vecchio link tornava valido non appena l'utente ripubblicava. «Rimuovi link» dava
// un falso senso di revoca.
//
// Ora cancella davvero l'oggetto dallo Storage e genera un nuovo `diary_token`: il vecchio link
// smette di funzionare in entrambi i modi in cui potrebbe essere stato salvato altrove.
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error: storageError } = await supabase.storage.from('dtrek-reports').remove([`${user.id}/diary.pdf`])
    // Un errore qui (es. il file non esiste già più) non deve impedire la revoca del link: quello
    // che conta per l'utente è che da questo momento il vecchio link non funzioni più.
    if (storageError) console.warn('[diary-token] rimozione PDF dallo storage fallita:', storageError.message)

    const { error } = await supabase
      .from('user_settings')
      .update({ diary_pdf_url: null, diary_token: crypto.randomUUID() })
      .eq('user_id', user.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
