import { NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/auth'

const DEVICE_ID = process.env.NEXT_PUBLIC_RING_DEVICE_ID
const DEVICE_NAME = process.env.NEXT_PUBLIC_RING_DEVICE_NAME || 'Camera'
const API_BASE = 'https://api.amazonvision.com'

export async function GET() {
  try {
    if (!DEVICE_ID) {
      return NextResponse.json({ devices: [], error: 'No device ID configured' })
    }

    const token = await getAccessToken()

    const statusRes = await fetch(`${API_BASE}/v1/devices/${DEVICE_ID}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    let online = false
    if (statusRes.ok) {
      const statusData = await statusRes.json()
      online = statusData?.data?.attributes?.online || false
    }

    return NextResponse.json({
      devices: [{
        id: DEVICE_ID,
        name: DEVICE_NAME,
        online,
        capabilities: { motionDetection: true },
      }],
    })
  } catch (error) {
    console.error('Devices error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch devices', devices: [] },
      { status: 500 }
    )
  }
}
