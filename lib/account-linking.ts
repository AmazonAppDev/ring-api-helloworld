// Ring one-way account linking, as documented in
// https://developer.amazon.com/docs/ring/authentication.html
//
// 1. Ring POSTs an authorization code to your Token Exchange URL. Swap it for tokens right away
//    (codes are short-lived) and read the Ring account id from GET /v1/users/me. The tokens are
//    "unclaimed": you don't yet know which of *your* users they belong to.
// 2. Ring sends the user's browser to your Account Link URL with ?nonce=…&time=…. After the user
//    signs in to your app, match the nonce (HMAC-SHA256 of "<time>:<account_id>" with your app's
//    HMAC signing key, URL-safe base64 without padding) against the unclaimed tokens, then
//    POST /v1/accounts/me/app-integrations and PATCH it to status "completed".
// 3. Keep the refresh token; access tokens expire after a few hours.
//
// No dependencies beyond Node's crypto and fetch, so it can be unit-tested with `node --test`.

import { createHmac, timingSafeEqual } from 'node:crypto'

export const RING_API = 'https://api.amazonvision.com'
export const RING_OAUTH = 'https://oauth.ring.com/oauth/token'

/** How old a link's `time` may be before we refuse it (Ring's links are meant to be used right away). */
export const LINK_WINDOW_MS = 10 * 60 * 1000

export interface AppCredentials {
  clientId: string
  clientSecret: string
  /** The app's HMAC signing key from the Developer Console (the same key that signs webhooks). */
  signingKey: string
}

export interface LinkRecord {
  accountId: string
  accessToken: string
  refreshToken: string
  expiresAt: number
  status: 'unclaimed' | 'awaiting' | 'completed'
  linkedTo?: string
  linkedAt?: number
}

/** The nonce Ring puts in the Account Link URL for a given Ring account. */
export function nonceFor(signingKey: string, time: string, accountId: string): string {
  return createHmac('sha256', signingKey).update(`${time}:${accountId}`).digest('base64url')
}

/** The link's `time` (ms since epoch) is recent and not from the future (5 s of clock skew allowed). */
export function isFreshTime(time: string, now = Date.now()): boolean {
  const t = Number(time)
  return Number.isFinite(t) && t <= now + 5000 && now - t <= LINK_WINDOW_MS
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

async function oauth(creds: AppCredentials, params: Record<string, string>, fetchFn: typeof fetch) {
  const res = await fetchFn(RING_OAUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, client_id: creds.clientId, client_secret: creds.clientSecret }).toString(),
  })
  if (!res.ok) throw new Error(`Ring OAuth ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
}

/** Step 1: exchange the code Ring POSTed to the Token Exchange URL. Returns an unclaimed record. */
export async function exchangeCode(creds: AppCredentials, code: string, fetchFn: typeof fetch = fetch, now = Date.now()): Promise<LinkRecord> {
  const t = await oauth(creds, { grant_type: 'authorization_code', code }, fetchFn)
  const me = await fetchFn(`${RING_API}/v1/users/me`, { headers: { Authorization: `Bearer ${t.access_token}` } })
  if (!me.ok) throw new Error(`GET /v1/users/me ${me.status}`)
  const accountId = (await me.json())?.data?.id
  if (typeof accountId !== 'string') throw new Error('GET /v1/users/me returned no account id')
  return { accountId, accessToken: t.access_token, refreshToken: t.refresh_token ?? '', expiresAt: now + t.expires_in * 1000, status: 'unclaimed' }
}

/** Finds the unclaimed record a link belongs to, or says why it can't. */
export function matchLink(records: LinkRecord[], signingKey: string, nonce: string, time: string, now = Date.now()): LinkRecord | string {
  if (!nonce || !time) return 'The link is missing its nonce or time. Start again from the Ring app.'
  if (!isFreshTime(time, now)) return 'This link has expired. Start again from the Ring app.'
  const rec = records.find((r) => r.status !== 'completed' && sameString(nonceFor(signingKey, time, r.accountId), nonce))
  return rec ?? "This link doesn't match a Ring account that just connected. Start again from the Ring app."
}

/**
 * Step 2, after your user has signed in to your app: tell Ring the link is made.
 * `accountIdentifier` is shown to the user in the Ring app, so mask it (e.g. j***@example.com).
 */
export async function completeLink(rec: LinkRecord, nonce: string, accountIdentifier: string, fetchFn: typeof fetch = fetch, now = Date.now()): Promise<LinkRecord> {
  const call = (method: 'POST' | 'PATCH', body: unknown) =>
    fetchFn(`${RING_API}/v1/accounts/me/app-integrations`, {
      method,
      headers: { Authorization: `Bearer ${rec.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  const post = await call('POST', { account_identifier: accountIdentifier, nonce })
  if (!post.ok) throw new Error(`POST app-integrations ${post.status}: ${(await post.text()).slice(0, 200)}`)
  const awaiting: LinkRecord = { ...rec, status: 'awaiting' }
  const patch = await call('PATCH', { status: 'completed' })
  if (!patch.ok) throw new Error(`PATCH app-integrations ${patch.status}: ${(await patch.text()).slice(0, 200)}`)
  return { ...awaiting, status: 'completed', linkedTo: accountIdentifier, linkedAt: now }
}

/** Step 3: a fresh access token from the refresh token (Ring may rotate the refresh token too). */
export async function refreshLink(creds: AppCredentials, rec: LinkRecord, fetchFn: typeof fetch = fetch, now = Date.now()): Promise<LinkRecord> {
  const t = await oauth(creds, { grant_type: 'refresh_token', refresh_token: rec.refreshToken }, fetchFn)
  return { ...rec, accessToken: t.access_token, refreshToken: t.refresh_token ?? rec.refreshToken, expiresAt: now + t.expires_in * 1000 }
}

/** j***@example.com — what Ring shows the user as the linked account. */
export function maskEmail(email: string): string {
  return email.replace(/^(.)(.*)(.@.*)$/, (_m, a: string, mid: string, b: string) => a + '*'.repeat(Math.max(1, mid.length)) + b)
}

/** App credentials from the environment, or null if account linking isn't configured. */
export function credentialsFromEnv(env: NodeJS.ProcessEnv = process.env): AppCredentials | null {
  const { RING_CLIENT_ID, RING_CLIENT_SECRET, RING_SIGNING_KEY } = env
  return RING_CLIENT_ID && RING_CLIENT_SECRET && RING_SIGNING_KEY ? { clientId: RING_CLIENT_ID, clientSecret: RING_CLIENT_SECRET, signingKey: RING_SIGNING_KEY } : null
}
