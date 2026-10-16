'use client'

import { useState, useRef, useCallback, useEffect, RefObject } from 'react'

interface UseWebRTCStreamOptions {
  videoRef: RefObject<HTMLVideoElement>
  deviceId?: string
}

interface UseWebRTCStreamReturn {
  streamActive: boolean
  streamError: string | null
  startStream: () => Promise<void>
  stopStream: () => Promise<void>
}

/**
 * Manages WebRTC connection to Ring camera stream.
 * Handles ICE gathering, SDP negotiation, and cleanup.
 */
export function useWebRTCStream({ videoRef, deviceId }: UseWebRTCStreamOptions): UseWebRTCStreamReturn {
  const [streamActive, setStreamActive] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
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

      // Ring's WHEP endpoint only accepts recvonly
      pc.addTransceiver('audio', { direction: 'recvonly' })
      pc.addTransceiver('video', { direction: 'recvonly' })

      // Ring closes sessions after 30-60s
      pc.onconnectionstatechange = () => {
        if (pcRef.current !== pc) return
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          setStreamActive(false)
          if (pc.connectionState === 'failed') setStreamError('The live view ended')
        }
      }

      pc.ontrack = (e) => {
        if (videoRef.current && e.streams[0]) {
          videoRef.current.srcObject = e.streams[0]
          setStreamActive(true)
        }
      }

      const offer = await pc.createOffer()
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
      // Clean up so a retry starts fresh
      pcRef.current?.close()
      pcRef.current = null
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
    setStreamError(null)
  }, [videoRef])

  // Close the session on unmount
  useEffect(() => {
    return () => {
      pcRef.current?.close()
      pcRef.current = null
      const sessionUrl = sessionUrlRef.current
      sessionUrlRef.current = null
      if (sessionUrl) {
        fetch('/api/ring/stream', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionUrl }),
          keepalive: true,
        }).catch(() => {})
      }
    }
  }, [])

  return { streamActive, streamError, startStream, stopStream }
}
