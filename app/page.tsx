'use client'

import { useState, useEffect, useRef } from 'react'
import { useVideoProcessing } from '@/lib/video-processors/useVideoProcessing'
import '@/lib/video-processors' // Register built-in processors

import { Header } from './components/Header'
import { EventPanel } from './components/EventPanel'
import { ProcessorPanel } from './components/ProcessorPanel'
import { useWebRTCStream } from './hooks/useWebRTCStream'
import { useEventStream } from './hooks/useEventStream'
import { useCanvasOverlay } from './hooks/useCanvasOverlay'

type RightPanelTab = 'events' | 'processors'

export default function Dashboard() {
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('events')
  const [webhookUrl, setWebhookUrl] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Custom hooks
  const { streamActive, streamError, startStream, stopStream } = useWebRTCStream({ videoRef })
  const { events, connected } = useEventStream({})
  const { processors, results, toggleProcessor, enabledCount } = useVideoProcessing({
    video: videoRef.current,
    canvas: canvasRef.current,
    enabled: streamActive,
    fps: 10,
  })

  // Canvas overlay rendering
  useCanvasOverlay({ videoRef, canvasRef, events, results })

  // Set webhook URL on mount
  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/webhook`)
  }, [])

  return (
    <div className="h-screen flex flex-col">
      <Header
        connected={connected}
        enabledCount={enabledCount}
      />

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Video (60%) */}
        <div className="w-[60%] p-4 flex flex-col">
          <div className="relative flex-1 bg-black rounded-xl overflow-hidden">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

            {!streamActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <button
                  onClick={startStream}
                  className="px-6 py-3 bg-dash-cyan text-black font-bold rounded-lg hover:bg-cyan-300 transition"
                >
                  ▶ Start Live Stream
                </button>
                {streamError && (
                  <p className="text-red-400 text-sm">{streamError}</p>
                )}
              </div>
            )}

            {streamActive && (
              <button
                onClick={stopStream}
                className="absolute top-3 right-3 px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-500"
              >
                ■ Stop
              </button>
            )}
          </div>

          {/* Webhook URL helper */}
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <span>Webhook URL:</span>
            <code className="bg-dash-card px-2 py-1 rounded text-slate-300 flex-1 truncate">{webhookUrl}</code>
            <button
              onClick={() => navigator.clipboard.writeText(webhookUrl)}
              className="px-2 py-1 bg-dash-card rounded hover:bg-slate-600 text-slate-400"
            >
              Copy
            </button>
          </div>
        </div>

        {/* Right: Events/Processors panel (40%) */}
        <div className="w-[40%] border-l border-slate-700 flex flex-col">
          {/* Tab switcher */}
          <div className="p-3 border-b border-slate-700 flex gap-2">
            <button
              onClick={() => setRightPanelTab('events')}
              className={`text-xs px-3 py-1 rounded-full ${rightPanelTab === 'events' ? 'bg-dash-cyan text-black font-medium' : 'bg-dash-card text-slate-400 hover:bg-slate-600'}`}
            >
              Events
            </button>
            <button
              onClick={() => setRightPanelTab('processors')}
              className={`text-xs px-3 py-1 rounded-full ${rightPanelTab === 'processors' ? 'bg-dash-cyan text-black font-medium' : 'bg-dash-card text-slate-400 hover:bg-slate-600'}`}
            >
              Processors {enabledCount > 0 && `(${enabledCount})`}
            </button>
          </div>

          {rightPanelTab === 'events' ? (
            <EventPanel events={events} webhookUrl={webhookUrl} />
          ) : (
            <ProcessorPanel processors={processors} results={results} onToggle={toggleProcessor} />
          )}
        </div>
      </div>
    </div>
  )
}
