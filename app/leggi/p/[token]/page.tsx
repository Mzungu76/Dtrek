import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import PdfViewer from '@/app/components/PdfViewer'

export const dynamic = 'force-dynamic'

// DTREK-AUDIT.md P2 #32 — variante di /leggi/r/[activityId] con token opaco invece
// dell'activityId in chiaro come chiave pubblica. /leggi/r rimane invariata per i
// link già in circolazione (retrocompatibilità); i nuovi link pubblicati usano questa.
export default async function ResocontoViewerByTokenPage({
  params,
}: {
  params: { token: string }
}) {
  const { token } = params

  const { data } = await supabase
    .from('hike_reports')
    .select('share_pdf_url, title')
    .eq('share_token', token)
    .not('share_pdf_url', 'is', null)
    .maybeSingle()

  if (!data?.share_pdf_url) return notFound()

  return (
    <PdfViewer
      pdfUrl={data.share_pdf_url as string}
      title={(data.title as string) || 'Resoconto escursione'}
    />
  )
}
