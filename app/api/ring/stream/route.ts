import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/auth'

const DEVICE_ID = process.env.NEXT_PUBLIC_RING_DEVICE_ID
const API_BASE = 'https://api.amazonvision.com'

export async function POST(request: NextRequest) {
  try {
    const { sdpOffer } = await request.json()

    if (!sdpOffer) {
      return NextResponse.json({ error: 'Missing sdpOffer' }, { status: 400 })
    }
    if (!DEVICE_ID) {
      return NextResponse.json({ error: 'No device ID configured' }, { status: 400 })
    }

    const token = await getAccessToken()
    const whepUrl = `${API_BASE}/v1/devices/${DEVICE_ID}/media/streaming/whep/sessions`

    const response = await fetch(whepUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/sdp',
      },
      body: sdpOffer,
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json(
        { error: `WHEP failed: ${response.status} - ${error}` },
        { status: response.status }
      )
    }

    const sdpAnswer = await response.text()
    const sessionUrl = response.headers.get('Location')

    return NextResponse.json({ sdpAnswer, sessionUrl })
  } catch (error) {
    console.error('Stream error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Stream failed' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { sessionUrl } = await request.json()
    if (!sessionUrl) {
      return NextResponse.json({ error: 'Missing sessionUrl' }, { status: 400 })
    }

    const token = await getAccessToken()
    await fetch(sessionUrl, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to close session' }, { status: 500 })
  }
}
