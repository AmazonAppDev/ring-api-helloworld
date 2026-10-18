export const RING_API = 'https://api.amazonvision.com'

/** The Ring session URL to act on, or null if it does not point at the Ring API.
 *  The Ring token is sent with the request, so it must never go to any other address. */
export function ringSessionUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw === '') return null
  try {
    const url = new URL(raw, RING_API)
    return url.origin === RING_API && url.username === '' ? url : null
  } catch {
    return null
  }
}

