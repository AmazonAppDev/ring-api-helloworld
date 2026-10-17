import { NextRequest, NextResponse } from 'next/server'
import { credentialsFromEnv, exchangeCode } from '@/lib/account-linking'
import { upsertLink } from '@/lib/link-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Token Exchange URL (set it in the Developer Console). Ring POSTs an authorization code here when a
 * user connects your app in the Ring app; exchange it right away. The result stays "unclaimed" until
 * the user finishes on the Account Link URL (/api/ring/link).
 */
export async function POST(request: NextRequest) {
  const creds = credentialsFromEnv()
  if (!creds) {
    return NextResponse.json({ error: 'Set RING_CLIENT_ID, RING_CLIENT_SECRET and RING_SIGNING_KEY to enable account linking' }, { status: 503 })
  }

  const raw = await request.text()
  let code: string | undefined
  try {
    code = JSON.parse(raw)?.code
  } catch {
    code = new URLSearchParams(raw).get('code') ?? undefined
  }
  if (!code) return NextResponse.json({ error: 'missing code' }, { status: 400 })

  try {
    const rec = await exchangeCode(creds, code)
    upsertLink(rec)
    console.log(`[LINK] Ring account ${rec.accountId.slice(0, 24)}… connected, waiting for sign-in`)
    return NextResponse.json({ status: 'ok' })
  } catch (err) {
    console.error('[LINK] Token exchange failed:', (err as Error).message)
    return NextResponse.json({ error: 'token exchange failed' }, { status: 502 })
  }
}
