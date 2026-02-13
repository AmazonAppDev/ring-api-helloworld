import { NextRequest, NextResponse } from 'next/server'
import { broadcastEvent, eventStore, addClient, removeClient } from '@/lib/sse-broadcast'
import { parseRingWebhook } from '@/lib/schemas/webhook'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const processedRequests = new Set<string>()
const MAX_PROCESSED_IDS = 1000

function normalizeRingEvent(body: any) {
  const { meta, data } = body
  return {
    event_id: data.id,
    event_type: data.type,
    timestamp: typeof data.attributes.timestamp === 'number'
      ? new Date(data.attributes.timestamp).toISOString()
      : data.attributes.timestamp || meta.time,
    device_id: data.attributes.source,
    confidence: data.attributes.confidence ?? null,
    bounding_box: data.attributes.bounding_box ?? null,
    thumbnail_url: data.attributes.thumbnail_url ?? null,
    metadata: {
      ring_version: meta.version,
      ring_time: meta.time,
      request_id: meta.request_id,
      source_type: data.attributes.source_type,
      device_link: data.relationships?.devices?.links?.self,
    },
    raw: body,
  }
}

function normalizeGenericEvent(body: any) {
  return {
    event_id: body.event_id || body.id || `evt_${Date.now()}`,
    event_type: body.event_type || body.type || 'unknown',
    timestamp: body.timestamp || new Date().toISOString(),
    device_id: body.device_id || null,
    confidence: body.confidence ?? null,
    bounding_box: body.bounding_box ?? null,
    thumbnail_url: body.thumbnail_url ?? null,
    metadata: body.metadata || {},
    raw: body,
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const expectedToken = process.env.RING_WEBHOOK_SECRET

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Idempotency check
    const requestId = body?.meta?.request_id
    if (requestId) {
      if (processedRequests.has(requestId)) {
        return NextResponse.json({ status: 'already_processed', request_id: requestId })
      }
      processedRequests.add(requestId)
      if (processedRequests.size > MAX_PROCESSED_IDS) {
        const idsToDelete = Array.from(processedRequests).slice(0, 100)
        idsToDelete.forEach((id) => processedRequests.delete(id))
      }
    }

    // Validate with Zod and normalize
    const parsed = parseRingWebhook(body)
    const event = parsed.success
      ? normalizeRingEvent(body)
      : normalizeGenericEvent(body)

    if (!parsed.success) {
      console.log('[WEBHOOK] Non-Ring payload, using generic normalization')
    }

    broadcastEvent(event)
    return NextResponse.json({ status: 'processed', event_id: event.event_id })
  } catch (error) {
    console.error('[WEBHOOK] Error:', error)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}

export async function GET() {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      addClient(controller)
      controller.enqueue(encoder.encode(': connected\n\n'))

      for (const event of eventStore) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      const keepAlive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')) }
        catch { clearInterval(keepAlive) }
      }, 30000)

      ;(controller as any)._keepAlive = keepAlive
    },
    cancel(controller) {
      removeClient(controller)
      const keepAlive = (controller as any)._keepAlive
      if (keepAlive) clearInterval(keepAlive)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
