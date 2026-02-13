/**
 * Ring Webhook Event Types
 * Based on Ring API documentation for partner webhooks.
 */

export interface RingWebhookMeta {
  version: string
  time: string
  request_id: string
}

export interface RingWebhookAttributes {
  source: string
  source_type: string
  timestamp: number | string
  confidence?: number
  bounding_box?: BoundingBox
  thumbnail_url?: string
}

export interface RingWebhookRelationships {
  devices?: {
    links?: {
      self?: string
    }
  }
}

export interface RingWebhookData {
  id: string
  type: 'motion_detected' | 'device_added' | 'device_removed' | 'person_detected'
  attributes: RingWebhookAttributes
  relationships?: RingWebhookRelationships
}

export interface RingWebhookPayload {
  meta: RingWebhookMeta
  data: RingWebhookData
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface NormalizedEvent {
  event_id: string
  event_type: string
  timestamp: string
  device_id: string | null
  confidence: number | null
  bounding_box: BoundingBox | null
  thumbnail_url: string | null
  metadata: {
    ring_version?: string
    ring_time?: string
    request_id?: string
    source_type?: string
    device_link?: string
  }
  raw: unknown
}

/** Type guard for Ring webhook payload */
export function isRingWebhookPayload(body: unknown): body is RingWebhookPayload {
  if (!body || typeof body !== 'object') return false
  const obj = body as Record<string, unknown>
  return (
    obj.meta !== undefined &&
    typeof obj.meta === 'object' &&
    obj.data !== undefined &&
    typeof obj.data === 'object'
  )
}
