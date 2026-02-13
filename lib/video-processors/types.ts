/**
 * Video Processor Plugin System
 * 
 * This module defines the interface for video processing plugins.
 * Plugins can analyze video frames and return results to display on the dashboard.
 */

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
  label?: string
  confidence?: number
  color?: string
}

export interface ProcessorResult {
  /** Unique ID for this result */
  id: string
  /** Processor that generated this result */
  processorId: string
  /** Timestamp when processing completed */
  timestamp: number
  /** Bounding boxes to draw on video */
  boundingBoxes?: BoundingBox[]
  /** Key-value data to display in the UI */
  data?: Record<string, any>
  /** Optional message/label to show */
  message?: string
}

export interface VideoProcessor {
  /** Unique identifier for this processor */
  id: string
  /** Display name */
  name: string
  /** Description of what this processor does */
  description: string
  /** Whether this processor is enabled */
  enabled: boolean
  
  /**
   * Initialize the processor (load models, etc.)
   * Called once when the processor is first enabled
   */
  init?(): Promise<void>
  
  /**
   * Process a video frame
   * @param frame - ImageData from canvas or video frame
   * @param canvas - The canvas element (for drawing or getting context)
   * @param video - The video element
   * @returns Processing result or null if nothing detected
   */
  process(
    frame: ImageData,
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement
  ): Promise<ProcessorResult | null>
  
  /**
   * Cleanup resources when processor is disabled
   */
  destroy?(): Promise<void>
}

export interface ProcessorRegistry {
  processors: Map<string, VideoProcessor>
  register(processor: VideoProcessor): void
  unregister(id: string): void
  get(id: string): VideoProcessor | undefined
  getEnabled(): VideoProcessor[]
  setEnabled(id: string, enabled: boolean): void
}
