import { z } from 'zod'

/** Bounding box schema */
export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})

/** Ring webhook meta schema */
export const RingWebhookMetaSchema = z.object({
  version: z.string(),
  time: z.string(),
  request_id: z.string(),
  /** Ring account ID (v1.1) */
  account_id: z.string().optional(),
})

/** Ring webhook attributes schema */
export const RingWebhookAttributesSchema = z.object({
  source: z.string(),
  source_type: z.string(),
  timestamp: z.union([z.number(), z.string()]),
  timestamp_readable: z.string().optional(),
  /** Motion subtype or subscription type */
  sub_type: z.string().optional(),
  /** Camera index on multi-camera devices */
  component_ids: z.array(z.string()).optional(),
  confidence: z.number().optional(),
  bounding_box: BoundingBoxSchema.optional(),
  thumbnail_url: z.string().optional(),
})

/** Ring webhook data schema */
export const RingWebhookDataSchema = z.object({
  id: z.string(),
  // person_detected kept for older payloads
  type: z.enum([
    'motion_detected', 'button_press', 'device_added', 'device_removed', 'device_online', 'device_offline',
    'app_integration_added', 'app_integration_removed', 'subscription_activated', 'subscription_deactivated',
    'person_detected',
  ]),
  attributes: RingWebhookAttributesSchema,
  relationships: z.object({
    devices: z.object({
      links: z.object({ self: z.string().optional() }).optional(),
    }).optional(),
  }).optional(),
})

/** Full Ring webhook payload schema */
export const RingWebhookPayloadSchema = z.object({
  meta: RingWebhookMetaSchema,
  data: RingWebhookDataSchema,
})

/** Normalized event schema */
export const NormalizedEventSchema = z.object({
  event_id: z.string(),
  event_type: z.string(),
  timestamp: z.string(),
  device_id: z.string().nullable(),
  confidence: z.number().nullable(),
  bounding_box: BoundingBoxSchema.nullable(),
  thumbnail_url: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  raw: z.unknown(),
})

export type RingWebhookPayload = z.infer<typeof RingWebhookPayloadSchema>
export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>
export type BoundingBox = z.infer<typeof BoundingBoxSchema>

/** Validate and parse Ring webhook payload */
export function parseRingWebhook(data: unknown) {
  return RingWebhookPayloadSchema.safeParse(data)
}
