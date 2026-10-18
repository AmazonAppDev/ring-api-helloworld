import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ringSessionUrl } from './ring-session.ts'

test('a Ring session URL is accepted', () => {
  const url = ringSessionUrl('https://api.amazonvision.com/v1/devices/d1/media/streaming/whep/sessions/s1')
  assert.equal(url?.href, 'https://api.amazonvision.com/v1/devices/d1/media/streaming/whep/sessions/s1')
})

test('a relative session path is resolved against the Ring API', () => {
  assert.equal(ringSessionUrl('/v1/devices/d1/sessions/s1')?.href, 'https://api.amazonvision.com/v1/devices/d1/sessions/s1')
})

test('any other address is refused, so the Ring token is never sent elsewhere', () => {
  for (const bad of [
    'http://attacker.example/',
    'https://api.amazonvision.com.attacker.example/x',
    'http://api.amazonvision.com/v1/x',
    'https://user@attacker.example/',
    'javascript:alert(1)',
    '',
    null,
    42,
  ]) {
    assert.equal(ringSessionUrl(bad), null, String(bad))
  }
})

