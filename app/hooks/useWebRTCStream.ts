'use client'

import { useState, useRef, useCallback, useEffect, RefObject } from 'react'

interface UseWebRTCStreamOptions {
  videoRef: RefObject<HTMLVideoElement>
  deviceId?: string
}

interface UseWebRTCStreamReturn {
  streamActive: boolean
  /** True while the stream is connected but no new video frames are arriving */
  streamStalled: boolean
  streamError: string | null
  startStream: () => Promise<void>
  stopStream: () => Promise<void>
}

// Count newly presented frames, not the media element's playback clock:
// currentTime may advance after the incoming picture has frozen.
const STALL_CHECK_MS = 2000
const STALL_AFTER_MS = 6000

/**
 * Manages WebRTC connection to Ring camera stream.
 * Handles ICE gathering, SDP negotiation, and cleanup.
 *
 * A WHEP session can stop delivering frames without any error event (for example when a
 * Developer Playground simulation ends), leaving the last frame frozen on screen. The hook
 * watches for freshly presented video frames and reports `streamStalled` so the UI can
 * offer a reconnect instead of silently showing a still image.
 */
export function useWebRTCStream({ videoRef, deviceId }: UseWebRTCStreamOptions): UseWebRTCStreamReturn {
  const [streamActive, setStreamActive] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [streamStalled, setStreamStalled] = useState(false)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const sessionUrlRef = useRef<string | null>(null)

  const startStream = useCallback(async () => {
    setStreamError(null)
    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      })
      pcRef.current = pc

      pc.addTransceiver('audio', { direction: 'sendrecv' })
      pc.addTransceiver('video', { direction: 'recvonly' })

      pc.ontrack = (e) => {
        // Only the video track should make the preview appear live.
        if (e.track.kind !== 'video') return
        // Some WHEP answers omit msid, so the track has no associated stream.
        const stream = e.streams[0] ?? new MediaStream([e.track])
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          setStreamActive(true)
        }
      }

      const offer = await pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true })
      await pc.setLocalDescription(offer)

      // Wait for ICE gathering
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === 'complete') return resolve()
        const timeout = setTimeout(() => resolve(), 3000)
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') {
            clearTimeout(timeout)
            resolve()
          }
        }
      })

      const res = await fetch('/api/ring/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdpOffer: pc.localDescription!.sdp, deviceId }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Stream start failed')
      }

      const { sdpAnswer, sessionUrl } = await res.json()
      sessionUrlRef.current = sessionUrl
      await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stream failed'
      console.error('Stream error:', err)
      setStreamError(message)
      setStreamActive(false)
    }
  }, [videoRef, deviceId])

  const stopStream = useCallback(async () => {
    pcRef.current?.close()
    pcRef.current = null
    if (sessionUrlRef.current) {
      await fetch('/api/ring/stream', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionUrl: sessionUrlRef.current }),
      }).catch(() => {})
      sessionUrlRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setStreamActive(false)
    setStreamStalled(false)
    setStreamError(null)
  }, [videoRef])

  // A video element's currentTime can keep advancing even after the remote stream stops
  // supplying frames. requestVideoFrameCallback observes newly presented frames instead.
  // Older browsers can use the decoded/presented frame counter where available.
  useEffect(() => {
    if (!streamActive) return
    const video = videoRef.current
    if (!video) return

    let lastFrameAt = performance.now()
    let lastFrameCount = video.getVideoPlaybackQuality?.().totalVideoFrames ?? 0
    let callbackId: number | null = null
    let disposed = false
    const hasFrameCallback = typeof video.requestVideoFrameCallback === 'function'
    const hasFrameCount = typeof video.getVideoPlaybackQuality === 'function'

    const onFrame = () => {
      lastFrameAt = performance.now()
      setStreamStalled(false)
    }

    const watchFrame: VideoFrameRequestCallback = () => {
      if (disposed) return
      onFrame()
      callbackId = video.requestVideoFrameCallback(watchFrame)
    }

    if (hasFrameCallback) callbackId = video.requestVideoFrameCallback(watchFrame)

    // Timers and frame callbacks can be throttled in background tabs. Allow the feed
    // time to recover after the tab becomes visible rather than reporting a false stall.
    const resetAfterVisibilityChange = () => {
      lastFrameAt = performance.now()
      lastFrameCount = video.getVideoPlaybackQuality?.().totalVideoFrames ?? lastFrameCount
      setStreamStalled(false)
    }
    document.addEventListener('visibilitychange', resetAfterVisibilityChange)

    const timer = setInterval(() => {
      if (document.hidden) return

      if (!hasFrameCallback) {
        if (!hasFrameCount) return // no reliable frame signal; don't guess from currentTime
        const count = video.getVideoPlaybackQuality().totalVideoFrames
        if (count > lastFrameCount) onFrame()
        lastFrameCount = count
      }

      setStreamStalled(performance.now() - lastFrameAt >= STALL_AFTER_MS)
    }, STALL_CHECK_MS)

    return () => {
      disposed = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', resetAfterVisibilityChange)
      if (callbackId !== null) video.cancelVideoFrameCallback(callbackId)
      setStreamStalled(false)
    }
  }, [streamActive, videoRef])

  return { streamActive, streamStalled, streamError, startStream, stopStream }
}
