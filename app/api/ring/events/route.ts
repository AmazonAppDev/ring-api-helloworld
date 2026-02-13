import { NextRequest, NextResponse } from 'next/server'
import { eventStore } from '@/lib/sse-broadcast'

/**
 * GET /api/ring/events
 * 
 * Returns events from the in-memory webhook event store.
 * Ring doesn't have a polling API for events - they're delivered via webhooks.
 * This endpoint returns events that have been received via webhook (or simulated via /api/webhook/test).
 */
export async function GET(request: NextRequest) {
  // Return events from the webhook event store
  // These are populated by:
  // 1. Real Ring webhooks POSTed to /api/webhook
  // 2. Simulated events from /api/webhook/test
  
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50')
  const events = eventStore.slice(0, limit)
  
  return NextResponse.json({ 
    events,
    source: 'webhook_store',
    count: events.length,
    total: eventStore.length,
  })
}
