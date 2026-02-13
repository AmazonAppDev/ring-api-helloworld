import { VideoProcessor, ProcessorRegistry } from './types'

/**
 * Global registry for video processors.
 * Processors register themselves here and the video pipeline
 * will call them for each frame.
 */
class VideoProcessorRegistry implements ProcessorRegistry {
  processors = new Map<string, VideoProcessor>()
  private listeners = new Set<() => void>()

  register(processor: VideoProcessor): void {
    this.processors.set(processor.id, processor)
    this.notifyListeners()
  }

  unregister(id: string): void {
    const processor = this.processors.get(id)
    if (processor?.destroy) {
      processor.destroy()
    }
    this.processors.delete(id)
    this.notifyListeners()
  }

  get(id: string): VideoProcessor | undefined {
    return this.processors.get(id)
  }

  getAll(): VideoProcessor[] {
    return Array.from(this.processors.values())
  }

  getEnabled(): VideoProcessor[] {
    return Array.from(this.processors.values()).filter(p => p.enabled)
  }

  setEnabled(id: string, enabled: boolean): void {
    const processor = this.processors.get(id)
    if (processor) {
      processor.enabled = enabled
      if (enabled && processor.init) {
        processor.init()
      } else if (!enabled && processor.destroy) {
        processor.destroy()
      }
      this.notifyListeners()
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners(): void {
    this.listeners.forEach(l => l())
  }
}

// Singleton instance
export const processorRegistry = new VideoProcessorRegistry()
