import { redirect } from 'next/navigation'

export default function EscursioneRedirect({ params }: { params: { id: string } }) {
  redirect(`/resoconto/${params.id}`)
}
