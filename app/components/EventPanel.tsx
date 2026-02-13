'use client'

import { useState, useMemo, useCallback } from 'react'
import { EventCard, DetectionEvent } from './EventCard'

export type FilterType = 'all' | 'person_detected' | 'motion_detected'

interface EventPanelProps {
  events: DetectionEvent[]
  webhookUrl: string
}

// Limit displayed events to prevent DOM bloat
const MAX_DISPLAYED_EVENTS = 100

export function EventPanel({ events, webhookUrl }: EventPanelProps) {
  const [filter, setFilter] = useState<FilterType>('all')
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const base = filter === 'all' ? events : events.filter(e => e.event_type === filter)
    return base.slice(0, MAX_DISPLAYED_EVENTS)
  }, [events, filter])

  const totalCount = useMemo(() => 
    filter === 'all' ? events.length : events.filter(e => e.event_type === filter).length,
    [events, filter]
  )

  const handleToggle = useCallback((eventId: string) => {
    setExpandedEvent(prev => prev === eventId ? null : eventId)
  }, [])

  return (
    <>
      {/* Filters */}
      <div className="p-3 border-b border-slate-700 flex gap-2">
        {(['all', 'person_detected', 'motion_detected'] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1 rounded-full ${filter === f ? 'bg-dash-cyan text-black font-medium' : 'bg-dash-card text-slate-400 hover:bg-slate-600'}`}
          >
            {f === 'all' ? 'All' : f === 'person_detected' ? 'Person' : 'Motion'}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">
          {filtered.length === totalCount ? totalCount : `${filtered.length}/${totalCount}`} events
        </span>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-slate-500 mt-8 text-sm">
            Waiting for detection events...<br />
            <span className="text-xs">POST events to {webhookUrl}</span>
          </p>
        ) : (
          filtered.map((event) => (
            <EventCard
              key={event.event_id}
              event={event}
              expanded={expandedEvent === event.event_id}
              onToggle={() => handleToggle(event.event_id)}
            />
          ))
        )}
      </div>
    </>
  )
}
