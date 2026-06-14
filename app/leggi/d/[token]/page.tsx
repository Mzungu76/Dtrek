import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import PdfViewer from '@/app/components/PdfViewer'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function DiarioViewerPage({
  params,
}: {
  params: { token: string }
}) {
  const { token } = params

  if (!UUID_RE.test(token)) return notFound()

  const { data } = await supabase
    .from('user_settings')
    .select('diary_pdf_url, display_name')
    .eq('diary_token', token)
    .not('diary_pdf_url', 'is', null)
    .maybeSingle()

  if (!data?.diary_pdf_url) return notFound()

  const ownerName = (data.display_name as string | null) ?? ''
  const title = ownerName ? `Diario di ${ownerName}` : 'Diario di viaggio'

  return <PdfViewer pdfUrl={data.diary_pdf_url as string} title={title} />
}
