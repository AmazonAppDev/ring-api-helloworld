import { createHmac, timingSafeEqual } from 'crypto'

/**
 * HMAC-SHA256 verification for Ring webhook deliveries.
 *
 * Ring signs the RAW request body and sends the signature as
 *   X-Signature: sha256=<lowercase hex>
 * using the HMAC Signature Key from the developer console as UTF-8 bytes.
 *
 * Callers must pass the exact string read from the request. Parsing the body
 * and re-serialising it will not reproduce the same bytes.
 */

export type VerifyResult =
  | { ok: true; header: string }
  | { ok: false; reason: string }

const SIGNATURE_HEADER = (process.env.RING_SIGNATURE_HEADER || 'x-signature').toLowerCase()

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function verifyRingSignature(rawBody: string, headers: Headers): VerifyResult {
  const secret = process.env.RING_SIGNING_KEY
  if (!secret) {
    // Fail closed: an unconfigured verifier must not accept traffic.
    return { ok: false, reason: 'RING_SIGNING_KEY is not configured' }
  }

  const provided = headers.get(SIGNATURE_HEADER)
  if (!provided) {
    return { ok: false, reason: 'missing ' + SIGNATURE_HEADER + ' header' }
  }

  const sig = (provided.startsWith('sha256=') ? provided.slice(7) : provided)
    .trim()
    .toLowerCase()

  const expected = createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(rawBody, 'utf8')
    .digest('hex')

  if (!safeEqualHex(sig, expected)) {
    return { ok: false, reason: 'signature mismatch on ' + SIGNATURE_HEADER }
  }
  return { ok: true, header: SIGNATURE_HEADER }
}
