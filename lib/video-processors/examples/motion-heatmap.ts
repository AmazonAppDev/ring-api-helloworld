import { VideoProcessor, ProcessorResult } from '../types'

/**
 * Example Processor: Motion Heatmap
 * 
 * Compares consecutive frames to detect motion and builds a heatmap
 * showing areas with the most movement.
 */
export class MotionHeatmapProcessor implements VideoProcessor {
  id = 'motion-heatmap'
  name = 'Motion Heatmap'
  description = 'Visualizes areas with detected motion as a heatmap overlay'
  enabled = false

  private previousFrame: ImageData | null = null
  private heatmap: Float32Array | null = null
  private frameCount = 0
  private readonly DECAY = 0.95 // How fast the heatmap fades
  private readonly THRESHOLD = 30 // Pixel difference threshold

  async init(): Promise<void> {
    this.previousFrame = null
    this.heatmap = null
    this.frameCount = 0
  }

  async process(
    frame: ImageData,
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement
  ): Promise<ProcessorResult | null> {
    const { width, height, data } = frame

    // Initialize heatmap if needed
    if (!this.heatmap || this.heatmap.length !== width * height) {
      this.heatmap = new Float32Array(width * height)
    }

    // Compare with previous frame
    if (this.previousFrame && this.previousFrame.width === width) {
      const prevData = this.previousFrame.data
      let motionPixels = 0

      for (let i = 0; i < data.length; i += 4) {
        const pixelIndex = i / 4
        
        // Calculate pixel difference (grayscale)
        const diff = Math.abs(
          (data[i] + data[i + 1] + data[i + 2]) / 3 -
          (prevData[i] + prevData[i + 1] + prevData[i + 2]) / 3
        )

        // Update heatmap
        this.heatmap[pixelIndex] *= this.DECAY
        if (diff > this.THRESHOLD) {
          this.heatmap[pixelIndex] = Math.min(1, this.heatmap[pixelIndex] + 0.3)
          motionPixels++
        }
      }

      // Store current frame for next comparison
      this.previousFrame = new ImageData(
        new Uint8ClampedArray(data),
        width,
        height
      )

      this.frameCount++

      // Return result with motion data
      const motionPercent = (motionPixels / (width * height)) * 100

      return {
        id: `motion-${Date.now()}`,
        processorId: this.id,
        timestamp: Date.now(),
        data: {
          motionPercent: motionPercent.toFixed(2),
          frameCount: this.frameCount,
          heatmap: this.heatmap, // Pass heatmap for rendering
        },
        message: motionPercent > 5 ? 'Motion detected!' : undefined,
      }
    }

    // Store first frame
    this.previousFrame = new ImageData(
      new Uint8ClampedArray(data),
      width,
      height
    )

    return null
  }

  async destroy(): Promise<void> {
    this.previousFrame = null
    this.heatmap = null
  }
}

export const motionHeatmapProcessor = new MotionHeatmapProcessor()
