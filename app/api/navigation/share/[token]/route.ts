import { NextRequest, NextResponse } from 'next/server'
import { fetchLiveSession } from '@/lib/liveSharePublic'

export const dynamic = 'force-dynamic'

// Public, unauthenticated — used by the polling viewer on app/s/live/[token]/page.tsx to
// refresh the position every ~10-15s without a full page reload. No auth check by design:
// the token itself (unguessable UUID + expiry, enforced inside fetchLiveSession) is the only
// access control, same principle as /api/share and the diary/activity public-read helpers.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const session = await fetchLiveSession(params.token)
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(session)
}
