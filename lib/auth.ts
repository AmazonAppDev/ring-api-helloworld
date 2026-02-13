// Shared Ring OAuth token management — same pattern as birdwatcher
let cachedToken: { token: string; expiresAt: number } | null = null

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: process.env.RING_REFRESH_TOKEN!,
    client_id: process.env.RING_CLIENT_ID || 'test-ava-partner-prod',
    client_secret: process.env.RING_CLIENT_SECRET || '',
  })

  const res = await fetch('https://oauth.ring.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Token refresh failed: ${error}`)
  }

  const data = await res.json()
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000) - 60000,
  }
  return data.access_token
}
