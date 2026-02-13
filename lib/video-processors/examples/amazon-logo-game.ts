import { VideoProcessor, ProcessorResult } from '../types'

/**
 * Amazon Logo Catch Game
 * 
 * Amazon logos appear on screen - touch them with your hand to score!
 * Uses MediaPipe Hands for accurate hand tracking.
 */
export class AmazonLogoGame implements VideoProcessor {
  id = 'amazon-logo-game'
  name = '🎯 Catch the Amazon Logo'
  description = 'Touch the Amazon logos with your hand to score!'
  enabled = false

  private score = 0
  private logosCaught = 0
  private logosMissed = 0
  private logos: Array<{ x: number; y: number; spawnTime: number; caught: boolean }> = []
  private lastSpawn = 0
  private frameWidth = 640
  private frameHeight = 480
  private readonly LOGO_SIZE = 80
  private readonly LOGO_DURATION = 3500
  private readonly SPAWN_INTERVAL = 2000
  private readonly MAX_LOGOS = 3
  private handPosition: { x: number; y: number } | null = null
  private handBoundingBox: { x: number; y: number; width: number; height: number } | null = null

  // MediaPipe
  private hands: any = null
  private ready = false
  private processing = false

  async init(): Promise<void> {
    this.score = 0
    this.logosCaught = 0
    this.logosMissed = 0
    this.logos = []
    this.lastSpawn = 0

    try {
      const { Hands } = await import('@mediapipe/hands')
      
      this.hands = new Hands({
        locateFile: (file: string) => 
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      })

      this.hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })

      this.hands.onResults((results: any) => {
        if (results.multiHandLandmarks?.[0]) {
          const landmarks = results.multiHandLandmarks[0]
          // Use index finger tip (landmark 8) for pointing
          const tip = landmarks[8]
          this.handPosition = {
            x: tip.x * this.frameWidth,
            y: tip.y * this.frameHeight,
          }
          
          // Calculate bounding box from all landmarks
          let minX = 1, minY = 1, maxX = 0, maxY = 0
          for (const lm of landmarks) {
            minX = Math.min(minX, lm.x)
            minY = Math.min(minY, lm.y)
            maxX = Math.max(maxX, lm.x)
            maxY = Math.max(maxY, lm.y)
          }
          this.handBoundingBox = {
            x: minX * this.frameWidth,
            y: minY * this.frameHeight,
            width: (maxX - minX) * this.frameWidth,
            height: (maxY - minY) * this.frameHeight,
          }
        } else {
          this.handPosition = null
          this.handBoundingBox = null
        }
        this.processing = false
      })

      await this.hands.initialize()
      this.ready = true
    } catch (error) {
      console.error('[LogoGame] MediaPipe init failed:', error)
    }
  }

  async process(
    frame: ImageData,
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement
  ): Promise<ProcessorResult | null> {
    const { width, height } = frame
    this.frameWidth = width
    this.frameHeight = height
    const now = Date.now()

    // Run hand detection
    if (this.ready && !this.processing) {
      this.processing = true
      this.hands.send({ image: video })
    }

    // Spawn new logos
    if (now - this.lastSpawn > this.SPAWN_INTERVAL && this.logos.filter(l => !l.caught).length < this.MAX_LOGOS) {
      this.spawnLogo(now)
      this.lastSpawn = now
    }

    // Check for catches and expired logos
    const caughtThisFrame: Array<{ x: number; y: number }> = []
    
    this.logos = this.logos.filter(logo => {
      if (logo.caught) return false
      
      const age = now - logo.spawnTime
      
      if (this.handPosition) {
        const distance = Math.sqrt(
          Math.pow(this.handPosition.x - (logo.x + this.LOGO_SIZE / 2), 2) +
          Math.pow(this.handPosition.y - (logo.y + this.LOGO_SIZE / 2), 2)
        )
        
        if (distance < this.LOGO_SIZE * 0.8 + 45) { // +45 for fire effect radius
          logo.caught = true
          this.score += 10
          this.logosCaught++
          caughtThisFrame.push({ x: logo.x, y: logo.y })
          return false
        }
      }
      
      if (age > this.LOGO_DURATION) {
        this.logosMissed++
        return false
      }
      
      return true
    })

    return {
      id: `logo-game-${now}`,
      processorId: this.id,
      timestamp: now,
      boundingBoxes: this.handBoundingBox ? [{
        ...this.handBoundingBox,
        label: 'Hand',
        color: '#00FF88',
      }] : [],
      data: {
        '🎯 Score': this.score,
        '✅ Caught': this.logosCaught,
        '❌ Missed': this.logosMissed,
        _gameState: {
          logos: this.logos.map(l => ({
            x: l.x,
            y: l.y,
            timeLeft: this.LOGO_DURATION - (now - l.spawnTime),
            maxTime: this.LOGO_DURATION,
          })),
          handPosition: this.handPosition,
          logoSize: this.LOGO_SIZE,
          score: this.score,
          caughtThisFrame,
          frameWidth: this.frameWidth,
          frameHeight: this.frameHeight,
        },
      },
      message: caughtThisFrame.length > 0 ? '🎉 +10!' : undefined,
    }
  }

  private spawnLogo(now: number): void {
    const padding = this.LOGO_SIZE + 30
    // Keep logos within center 80% to avoid letterbox areas
    const safeMarginX = this.frameWidth * 0.1
    const safeMarginY = this.frameHeight * 0.1
    this.logos.push({
      x: safeMarginX + padding + Math.random() * (this.frameWidth - safeMarginX * 2 - padding * 2),
      y: safeMarginY + padding + Math.random() * (this.frameHeight - safeMarginY * 2 - padding * 2),
      spawnTime: now,
      caught: false,
    })
  }

  async destroy(): Promise<void> {
    if (this.hands) {
      this.hands.close()
      this.hands = null
    }
    this.ready = false
    this.score = 0
    this.logos = []
  }
}

export const amazonLogoGame = new AmazonLogoGame()
