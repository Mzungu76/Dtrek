import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import PdfViewer from '@/app/components/PdfViewer'

export const dynamic = 'force-dynamic'

export default async function ResocontoViewerPage({
  params,
}: {
  params: { activityId: string }
}) {
  const { activityId } = params

  const { data } = await supabase
    .from('hike_reports')
    .select('share_pdf_url, title')
    .eq('activity_id', activityId)
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
