import { NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/auth'

export async function GET() {
  try {
    const accessToken = await getAccessToken()
    return NextResponse.json({ accessToken })
  } catch (error) {
    console.error('Token error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get token' },
      { status: 500 }
    )
  }
}
