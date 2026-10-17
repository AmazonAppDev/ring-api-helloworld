// Run: node --test tests/account-linking.test.mjs  (Node 22.18+ loads the TypeScript module directly)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { completeLink, exchangeCode, isFreshTime, maskEmail, matchLink, nonceFor, refreshLink } from '../lib/account-linking.ts'

const creds = { clientId: 'cid', clientSecret: 'secret', signingKey: 'hmac-key' }
const ACCOUNT = 'ava1.ring.account.ABC123'

test('nonce: HMAC-SHA256 of "<time>:<account_id>", URL-safe base64 without padding', () => {
  const want = createHmac('sha256', 'hmac-key').update(`1700000000000:${ACCOUNT}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  assert.equal(nonceFor('hmac-key', '1700000000000', ACCOUNT), want)
})

test('link time must be recent and not in the future', () => {
  const now = 1_700_000_000_000
  assert.ok(isFreshTime(String(now - 60_000), now))
  assert.ok(!isFreshTime(String(now - 11 * 60_000), now))
  assert.ok(!isFreshTime(String(now + 60_000), now))
  assert.ok(!isFreshTime('soon', now))
})

test('exchange → unclaimed record → matched by nonce → POST then PATCH → completed', async () => {
  const calls = []
  const fake = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body })
    if (String(url).includes('oauth')) return Response.json({ access_token: 'at', refresh_token: 'rt', expires_in: 14400 })
    if (String(url).endsWith('/v1/users/me')) return Response.json({ data: { id: ACCOUNT } })
    return new Response(null, { status: 200 })
  }
  const now = 1_700_000_000_000
  const rec = await exchangeCode(creds, 'the-code', fake, now)
  assert.equal(rec.status, 'unclaimed')
  assert.equal(rec.accountId, ACCOUNT)
  assert.match(calls[0].body, /grant_type=authorization_code/)
  assert.match(calls[0].body, /code=the-code/)

  const time = String(now - 5_000)
  const nonce = nonceFor(creds.signingKey, time, ACCOUNT)
  assert.match(matchLink([rec], creds.signingKey, 'wrong', time, now), /doesn't match/)
  const found = matchLink([rec], creds.signingKey, nonce, time, now)
  assert.equal(found, rec)

  const done = await completeLink(found, nonce, maskEmail('jane@example.com'), fake, now)
  assert.equal(done.status, 'completed')
  const integ = calls.filter((c) => c.url.endsWith('/v1/accounts/me/app-integrations'))
  assert.deepEqual(integ.map((c) => c.method), ['POST', 'PATCH'])
  assert.deepEqual(JSON.parse(integ[0].body), { account_identifier: 'j**e@example.com', nonce })
  assert.deepEqual(JSON.parse(integ[1].body), { status: 'completed' })
  assert.match(matchLink([done], creds.signingKey, nonce, time, now), /doesn't match/, 'a completed link is not matched again')
})

test('a rejected POST stops the link', async () => {
  const fake = async () => new Response('nope', { status: 400 })
  const rec = { accountId: ACCOUNT, accessToken: 'at', refreshToken: 'rt', expiresAt: 0, status: 'unclaimed' }
  await assert.rejects(completeLink(rec, 'n', 'j***@example.com', fake), /POST app-integrations 400/)
})

test('refresh keeps the old refresh token unless Ring rotates it', async () => {
  const rec = { accountId: ACCOUNT, accessToken: 'old', refreshToken: 'rt1', expiresAt: 0, status: 'completed' }
  const a = await refreshLink(creds, rec, async () => Response.json({ access_token: 'new', expires_in: 100 }), 1000)
  assert.equal(a.refreshToken, 'rt1')
  assert.equal(a.expiresAt, 101_000)
  const b = await refreshLink(creds, rec, async () => Response.json({ access_token: 'new', refresh_token: 'rt2', expires_in: 100 }), 1000)
  assert.equal(b.refreshToken, 'rt2')
})
