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

// How often to check that the video is still advancing, and how many checks in a row
// without progress count as a stalled stream.
const STALL_CHECK_MS = 2000
const STALL_CHECKS = 2

/**
 * Manages WebRTC connection to Ring camera stream.
 * Handles ICE gathering, SDP negotiation, and cleanup.
 *
 * A WHEP session can stop delivering frames without any error event (for example when a
 * Developer Playground simulation ends), leaving the last frame frozen on screen. The hook
 * watches the video's playback position and reports `streamStalled` so the UI can offer a
 * reconnect instead of silently showing a still image.
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
        // Some WHEP answers carry no stream id, so fall back to wrapping the track itself
        const stream = e.streams[0] ?? (e.track.kind === 'video' ? new MediaStream([e.track]) : null)
        if (videoRef.current && stream) {
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

  // Watch for a frozen picture: the video's currentTime stops advancing while the
  // peer connection still looks open.
  useEffect(() => {
    if (!streamActive) return
    let lastTime = -1
    let stuck = 0
    const timer = setInterval(() => {
      const video = videoRef.current
      if (!video) return
      stuck = video.currentTime === lastTime ? stuck + 1 : 0
      lastTime = video.currentTime
      setStreamStalled(stuck >= STALL_CHECKS)
    }, STALL_CHECK_MS)
    return () => {
      clearInterval(timer)
      setStreamStalled(false)
    }
  }, [streamActive, videoRef])

  return { streamActive, streamStalled, streamError, startStream, stopStream }
}
