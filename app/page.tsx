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
type AuthMode = 'access_token' | 'refresh_token' | null

export default function Dashboard() {
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('events')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined)
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Fetch auth mode on mount
  useEffect(() => {
    fetch('/api/ring/config')
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setAuthError(data.error)
        } else {
          setAuthMode(data.mode)
        }
      })
      .catch(err => setAuthError(err.message))
      .finally(() => setLoading(false))
  }, [])

  // Auto-discover device on mount (after auth mode is confirmed)
  useEffect(() => {
    if (!authMode) return
    fetch('/api/ring/devices')
      .then(res => res.json())
      .then(data => {
        if (data.devices && data.devices.length > 0) {
          setDeviceId(data.devices[0].id)
        } else {
          setDeviceError(data.error || 'No devices found')
        }
      })
      .catch(err => setDeviceError(err.message))
  }, [authMode])

  // Custom hooks
  const { streamActive, streamError, startStream, stopStream } = useWebRTCStream({ videoRef, deviceId })
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

  const isSimpleMode = authMode === 'access_token'

  // Loading state
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-dash-bg">
        <p className="text-slate-400">Loading...</p>
      </div>
    )
  }

  // Auth error state
  if (authError) {
    return (
      <div className="h-screen flex items-center justify-center bg-dash-bg">
        <div className="text-center max-w-md">
          <p className="text-red-400 text-lg font-medium mb-2">Configuration Error</p>
          <p className="text-slate-400">{authError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col">
      <Header
        connected={isSimpleMode ? false : connected}
        enabledCount={isSimpleMode ? 0 : enabledCount}
        simpleMode={isSimpleMode}
      />

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Video section — full width in simple mode, 60% in full mode */}
        <div className={`${isSimpleMode ? 'w-full' : 'w-[60%]'} p-4 flex flex-col`}>
          <div className="relative flex-1 bg-black rounded-xl overflow-hidden">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

            {!streamActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <button
                  onClick={startStream}
                  disabled={!deviceId}
                  className={`px-6 py-3 font-bold rounded-lg transition ${deviceId ? 'bg-dash-cyan text-black hover:bg-cyan-300' : 'bg-slate-600 text-slate-400 cursor-not-allowed'}`}
                >
                  {deviceId ? '▶ Start Live Stream' : '⏳ Discovering device...'}
                </button>
                {streamError && (
                  <p className="text-red-400 text-sm">{streamError}</p>
                )}
                {deviceError && (
                  <p className="text-red-400 text-sm">{deviceError}</p>
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

          {/* Webhook URL helper — only in full mode */}
          {!isSimpleMode && (
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
          )}
        </div>

        {/* Right panel — only shown in refresh_token (full) mode */}
        {!isSimpleMode && (
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
        )}
      </div>
    </div>
  )
}
