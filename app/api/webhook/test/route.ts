import { NextRequest, NextResponse } from 'next/server'
import { broadcastEvent } from '@/lib/sse-broadcast'

/**
 * Test endpoint to simulate Ring webhook events for local development.
 * 
 * Usage:
 *   POST /api/webhook/test
 *   POST /api/webhook/test?type=motion_detected
 *   POST /api/webhook/test?type=device_added
 */
export async function POST(request: NextRequest) {
  const eventType = request.nextUrl.searchParams.get('type') || 'motion_detected'
  const deviceId = process.env.NEXT_PUBLIC_RING_DEVICE_ID || 'test-device-123'
  
  // Simulate Ring's JSON:API webhook payload
  const timestamp = Date.now()
  const eventId = `evt_${timestamp}_${Math.random().toString(36).slice(2, 8)}`
  const requestId = `req_${Math.random().toString(36).slice(2, 10)}`
  
  const ringPayload = {
    meta: {
      version: '1.0',
      time: new Date().toISOString(),
      request_id: requestId,
    },
    data: {
      id: eventId,
      type: eventType,
      attributes: {
        source: deviceId,
        source_type: 'devices',
        timestamp: timestamp,
        // Add simulated confidence for motion events
        ...(eventType === 'motion_detected' && {
          confidence: Math.random() * 0.3 + 0.7, // 0.7-1.0
          bounding_box: {
            x: Math.floor(Math.random() * 400) + 100,
            y: Math.floor(Math.random() * 200) + 50,
            width: Math.floor(Math.random() * 150) + 100,
            height: Math.floor(Math.random() * 250) + 150,
          },
        }),
      },
      relationships: {
        devices: {
          links: {
            self: `/v1/devices/${deviceId}`,
          },
        },
      },
    },
  }

  // Normalize and broadcast (same logic as real webhook)
  const event = {
    event_id: ringPayload.data.id,
    event_type: ringPayload.data.type,
    timestamp: new Date(ringPayload.data.attributes.timestamp).toISOString(),
    device_id: ringPayload.data.attributes.source,
    confidence: ringPayload.data.attributes.confidence ?? null,
    bounding_box: ringPayload.data.attributes.bounding_box ?? null,
    thumbnail_url: null,
    metadata: {
      ring_version: ringPayload.meta.version,
      ring_time: ringPayload.meta.time,
      request_id: ringPayload.meta.request_id,
      source_type: ringPayload.data.attributes.source_type,
      device_link: ringPayload.data.relationships.devices.links.self,
      simulated: true,
    },
    raw: ringPayload,
  }

  broadcastEvent(event)

  return NextResponse.json({ 
    status: 'simulated', 
    event_id: event.event_id,
    event_type: event.event_type,
  })
}

// GET - simple info about the test endpoint
export async function GET() {
  return NextResponse.json({
    description: 'Test endpoint to simulate Ring webhook events',
    usage: {
      motion: 'POST /api/webhook/test?type=motion_detected',
      device_added: 'POST /api/webhook/test?type=device_added',
      device_removed: 'POST /api/webhook/test?type=device_removed',
    },
  })
}
