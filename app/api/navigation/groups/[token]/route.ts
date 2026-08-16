import { NextRequest, NextResponse } from 'next/server'
import { fetchPublicGroup } from '@/lib/groupSharePublic'

export const dynamic = 'force-dynamic'

// Pubblico, nessuna auth — usato dal polling della pagina app/s/live/group/[token]. Stesso
// principio di app/api/navigation/share/[token]/route.ts (Fase 1).
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const group = await fetchPublicGroup(params.token)
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(group)
}
