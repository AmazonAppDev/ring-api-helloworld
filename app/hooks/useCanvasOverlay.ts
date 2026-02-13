'use client'

import { useEffect, useRef, RefObject } from 'react'
import { DetectionEvent } from '../components/EventCard'
import { ProcessorResult } from '@/lib/video-processors/types'

interface UseCanvasOverlayOptions {
  videoRef: RefObject<HTMLVideoElement>
  canvasRef: RefObject<HTMLCanvasElement>
  events: DetectionEvent[]
  results: Map<string, ProcessorResult>
}

/**
 * Renders bounding boxes, heatmaps, and game overlays on canvas.
 * Uses refs to avoid re-creating animation loop on data changes.
 */
export function useCanvasOverlay({ videoRef, canvasRef, events, results }: UseCanvasOverlayOptions) {
  // Use refs to avoid recreating animation loop
  const eventsRef = useRef(events)
  const resultsRef = useRef(results)

  useEffect(() => { eventsRef.current = events }, [events])
  useEffect(() => { resultsRef.current = results }, [results])

  useEffect(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number

    const draw = () => {
      canvas.width = video.clientWidth
      canvas.height = video.clientHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const videoWidth = video.videoWidth || 1920
      const videoHeight = video.videoHeight || 1080
      const scaleX = canvas.width / videoWidth
      const scaleY = canvas.height / videoHeight

      // Draw boxes from webhook events
      const currentEvents = eventsRef.current
      const recent = currentEvents.filter((e) => e.bounding_box).slice(0, 5)
      for (const e of recent) {
        const bb = e.bounding_box!
        ctx.strokeStyle = e.event_type === 'person_detected' ? '#22D3EE' : '#22C55E'
        ctx.lineWidth = 2
        ctx.strokeRect(bb.x * scaleX, bb.y * scaleY, bb.width * scaleX, bb.height * scaleY)
        ctx.fillStyle = ctx.strokeStyle
        ctx.font = '12px monospace'
        ctx.fillText(
          `${e.event_type} ${e.confidence ? (e.confidence * 100).toFixed(0) + '%' : ''}`,
          bb.x * scaleX, bb.y * scaleY - 4
        )
      }

      // Draw boxes from video processors (skip logo game - uses fire effect)
      const currentResults = resultsRef.current
      currentResults.forEach((result) => {
        if (result.processorId === 'amazon-logo-game') return
        if (result.boundingBoxes) {
          for (const bb of result.boundingBoxes) {
            ctx.strokeStyle = bb.color || '#FF00FF'
            ctx.lineWidth = 2
            ctx.strokeRect(bb.x * scaleX, bb.y * scaleY, bb.width * scaleX, bb.height * scaleY)
            if (bb.label) {
              ctx.fillStyle = ctx.strokeStyle
              ctx.font = '11px monospace'
              ctx.fillText(bb.label, bb.x * scaleX, bb.y * scaleY - 4)
            }
          }
        }
      })

      // Draw motion heatmap
      const heatmapResult = currentResults.get('motion-heatmap')
      if (heatmapResult?.data?.heatmap) {
        drawHeatmap(ctx, heatmapResult.data.heatmap as Float32Array, videoWidth, videoHeight, scaleX, scaleY)
      }

      // Draw Amazon Logo Game
      const logoGameResult = currentResults.get('amazon-logo-game')
      if (logoGameResult?.data?._gameState) {
        drawLogoGame(ctx, logoGameResult.data._gameState, canvas.width, canvas.height)
      }

      animationId = requestAnimationFrame(draw)
    }

    animationId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animationId)
  }, [canvasRef, videoRef])
}

function drawHeatmap(
  ctx: CanvasRenderingContext2D,
  heatmap: Float32Array,
  videoWidth: number,
  videoHeight: number,
  scaleX: number,
  scaleY: number
) {
  ctx.globalAlpha = 0.3
  for (let y = 0; y < videoHeight; y += 8) {
    for (let x = 0; x < videoWidth; x += 8) {
      const idx = y * videoWidth + x
      const heat = heatmap[idx] || 0
      if (heat > 0.1) {
        const r = Math.min(255, heat * 510)
        const g = Math.min(255, (1 - heat) * 255)
        ctx.fillStyle = `rgb(${r}, ${g}, 0)`
        ctx.fillRect(x * scaleX, y * scaleY, 8 * scaleX, 8 * scaleY)
      }
    }
  }
  ctx.globalAlpha = 1
}

// Cache the box image
let boxImage: HTMLImageElement | null = null
function getBoxImage(): HTMLImageElement {
  if (!boxImage) {
    boxImage = new Image()
    boxImage.src = '/box.png'
  }
  return boxImage
}

function drawLogoGame(ctx: CanvasRenderingContext2D, game: any, canvasWidth: number, canvasHeight: number) {
  const gameScaleX = canvasWidth / game.frameWidth
  const gameScaleY = canvasHeight / game.frameHeight
  const now = Date.now()
  const img = getBoxImage()

  // Draw logos
  for (const logo of game.logos) {
    const x = logo.x * gameScaleX
    const y = logo.y * gameScaleY
    const size = game.logoSize * gameScaleX
    const progress = logo.timeLeft / logo.maxTime
    const opacity = Math.min(1, logo.timeLeft / 1000)
    const pulse = 1 + Math.sin(now / 200) * 0.08
    const drawSize = size * pulse

    ctx.globalAlpha = opacity
    const urgencyColor = logo.timeLeft < 1000 ? '#FF4444' : logo.timeLeft < 2000 ? '#FFAA00' : '#FF9900'

    // Timer ring background
    ctx.strokeStyle = urgencyColor
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(x + size / 2, y + size / 2, drawSize / 2 + 10, 0, Math.PI * 2)
    ctx.stroke()

    // Draw box image
    if (img.complete) {
      ctx.drawImage(img, x + (size - drawSize) / 2, y + (size - drawSize) / 2, drawSize, drawSize)
    }

    // Timer ring progress
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(x + size / 2, y + size / 2, drawSize / 2 + 10, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2)
    ctx.stroke()

    ctx.globalAlpha = 1
    ctx.textAlign = 'left'
  }

  // Draw fire effect around hand
  if (game.handPosition) {
    const hx = game.handPosition.x * gameScaleX
    const hy = game.handPosition.y * gameScaleY
    
    drawFireEffect(ctx, hx, hy, now)
  }

  // Score display
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
  ctx.fillRect(10, 10, 140, 50)
  ctx.strokeStyle = '#FF9900'
  ctx.lineWidth = 2
  ctx.strokeRect(10, 10, 140, 50)
  ctx.fillStyle = '#FF9900'
  ctx.font = 'bold 28px Arial'
  ctx.fillText(`🎯 ${game.score}`, 25, 45)
}

function drawFireEffect(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  const particles = 12
  
  for (let i = 0; i < particles; i++) {
    const angle = (i / particles) * Math.PI * 2 + time / 200
    const wave = Math.sin(time / 100 + i) * 0.5 + 0.5
    const radius = 25 + wave * 20
    const size = 8 + wave * 12
    
    const px = x + Math.cos(angle) * radius
    const py = y + Math.sin(angle) * radius - wave * 15
    
    // Fire gradient: yellow core -> orange -> red edges
    const gradient = ctx.createRadialGradient(px, py, 0, px, py, size)
    gradient.addColorStop(0, `rgba(255, 255, 100, ${0.9 - wave * 0.3})`)
    gradient.addColorStop(0.4, `rgba(255, 150, 0, ${0.7 - wave * 0.2})`)
    gradient.addColorStop(1, 'rgba(255, 50, 0, 0)')
    
    ctx.beginPath()
    ctx.arc(px, py, size, 0, Math.PI * 2)
    ctx.fillStyle = gradient
    ctx.fill()
  }
  
  // Inner glow
  const innerGlow = ctx.createRadialGradient(x, y, 0, x, y, 35)
  innerGlow.addColorStop(0, 'rgba(255, 200, 50, 0.6)')
  innerGlow.addColorStop(0.5, 'rgba(255, 100, 0, 0.3)')
  innerGlow.addColorStop(1, 'rgba(255, 50, 0, 0)')
  
  ctx.beginPath()
  ctx.arc(x, y, 35, 0, Math.PI * 2)
  ctx.fillStyle = innerGlow
  ctx.fill()
}
