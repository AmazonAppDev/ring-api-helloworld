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
})

/** Ring webhook attributes schema */
export const RingWebhookAttributesSchema = z.object({
  source: z.string(),
  source_type: z.string(),
  timestamp: z.union([z.number(), z.string()]),
  confidence: z.number().optional(),
  bounding_box: BoundingBoxSchema.optional(),
  thumbnail_url: z.string().optional(),
})

/** Ring webhook data schema */
export const RingWebhookDataSchema = z.object({
  id: z.string(),
  type: z.enum(['motion_detected', 'device_added', 'device_removed', 'person_detected']),
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
