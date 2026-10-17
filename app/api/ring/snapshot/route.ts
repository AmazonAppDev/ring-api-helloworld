import { NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/auth'

const API_BASE = 'https://api.amazonvision.com'

// GET /api/ring/snapshot?deviceId=...&timestamp=<epoch ms>   (or &minutes=10 for the latest frame)
// Ring answers 303 with a pre-signed Location; fetch it WITHOUT the bearer token.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const deviceId = searchParams.get('deviceId')
  if (!deviceId) return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })

  const timestamp = searchParams.get('timestamp')
  const minutes = Number(searchParams.get('minutes') ?? 10)
  const now = Date.now()
  const body = timestamp
    ? { type: 'at_timestamp', timestamp: Number(timestamp) }
    : { type: 'latest_in_range', start_timestamp: now - minutes * 60_000, end_timestamp: now }

  try {
    const token = await getAccessToken()
    const res = await fetch(`${API_BASE}/v1/devices/${encodeURIComponent(deviceId)}/media/image/download`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, image_options: { format: 'jpeg', resolution: { width: 1920, height: 1080 } } }),
      redirect: 'manual',
    })
    if (res.status !== 303) {
      return NextResponse.json({ error: `Snapshot failed: ${res.status} - ${await res.text()}` }, { status: res.status })
    }
    const location = res.headers.get('Location')
    if (!location) return NextResponse.json({ error: 'Snapshot 303 without Location' }, { status: 502 })

    const image = await fetch(location) // pre-signed: no Authorization header
    if (!image.ok) return NextResponse.json({ error: `Pre-signed URL failed: ${image.status}` }, { status: 502 })

    return new NextResponse(await image.arrayBuffer(), {
      headers: {
        'Content-Type': image.headers.get('Content-Type') ?? 'image/jpeg',
        'Cache-Control': 'no-store',
        'X-Media-Timestamp': res.headers.get('X-Media-Timestamp') ?? '',
      },
    })
  } catch (error) {
    console.error('Snapshot error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Snapshot failed' }, { status: 500 })
  }
}
