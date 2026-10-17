import { NextRequest, NextResponse } from 'next/server'
import { completeLink, credentialsFromEnv, maskEmail, matchLink } from '@/lib/account-linking'
import { loadLinks, upsertLink } from '@/lib/link-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function page(body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Link your Ring account</title>` +
      `<body style="font-family:system-ui,sans-serif;max-width:420px;margin:48px auto;padding:0 16px;line-height:1.5">${body}</body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

/**
 * Account Link URL (set it in the Developer Console). Ring sends the user here with ?nonce&time after
 * the token exchange. The user signs in to *your* app first; only then is the nonce matched and the
 * link completed. This sample's "sign-in" is just an email field: replace it with your real login.
 */
export async function GET(request: NextRequest) {
  const nonce = request.nextUrl.searchParams.get('nonce') ?? ''
  const time = request.nextUrl.searchParams.get('time') ?? ''
  return page(
    `<h1>Link your Ring account</h1><p>Sign in to finish connecting Ring.</p>` +
      `<form method="post"><input type="hidden" name="nonce" value="${esc(nonce)}"><input type="hidden" name="time" value="${esc(time)}">` +
      `<label>Email<br><input name="email" type="email" required style="width:100%;padding:8px"></label>` +
      `<p><button style="padding:8px 16px">Sign in and link</button></p></form>`
  )
}

export async function POST(request: NextRequest) {
  const creds = credentialsFromEnv()
  if (!creds) return page('<p>Account linking is not configured on this server.</p>', 503)

  const form = new URLSearchParams(await request.text())
  const nonce = form.get('nonce') ?? ''
  const time = form.get('time') ?? ''
  const email = (form.get('email') ?? '').trim()
  if (!email) return page('<p>Enter your email.</p>', 400)

  const rec = matchLink(loadLinks(), creds.signingKey, nonce, time)
  if (typeof rec === 'string') return page(`<p>${esc(rec)}</p>`, 400)

  try {
    upsertLink(await completeLink(rec, nonce, maskEmail(email)))
    console.log('[LINK] Account link completed. The refresh token is in .ring-links.json')
    return page('<h1>Linked</h1><p>Your Ring account is connected. You can close this page.</p>')
  } catch (err) {
    console.error('[LINK] Completing the link failed:', (err as Error).message)
    return page("<p>Ring didn't accept the link. Start again from the Ring app.</p>", 502)
  }
}
