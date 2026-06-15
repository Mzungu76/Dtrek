import { redirect } from 'next/navigation'

export default function ResocontoPage({ params }: { params: { id: string } }) {
  redirect(`/escursione/${encodeURIComponent(params.id)}`)
}
