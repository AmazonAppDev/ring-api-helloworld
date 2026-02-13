/**
 * SSE broadcast utilities for webhook events.
 * Manages client connections and event distribution.
 */

// In-memory event store
export const eventStore: any[] = []
const MAX_EVENTS = 200

// SSE clients
const clients = new Set<ReadableStreamDefaultController>()

export function broadcastEvent(event: any) {
  eventStore.unshift(event)
  if (eventStore.length > MAX_EVENTS) eventStore.pop()
  const data = `data: ${JSON.stringify(event)}\n\n`
  clients.forEach((controller) => {
    try {
      controller.enqueue(new TextEncoder().encode(data))
    } catch {
      clients.delete(controller)
    }
  })
}

export function addClient(controller: ReadableStreamDefaultController) {
  clients.add(controller)
}

export function removeClient(controller: ReadableStreamDefaultController) {
  clients.delete(controller)
}

export function getClients() {
  return clients
}
