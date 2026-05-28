import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.text()

  const upstream = await fetch('https://overpass-api.de/api/interpreter', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!upstream.ok) {
    return NextResponse.json({ error: 'Overpass error' }, { status: upstream.status })
  }

  const data = await upstream.json()
  return NextResponse.json(data)
}
