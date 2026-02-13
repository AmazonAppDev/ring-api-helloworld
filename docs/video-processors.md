# Video Processor Plugin System

This guide explains how to create custom video processors that analyze the live stream in real-time.

## Quick Start

1. Create a new file in `lib/video-processors/`:

```typescript
// lib/video-processors/my-processor.ts
import { VideoProcessor, ProcessorResult } from './types'
import { processorRegistry } from './registry'

class MyProcessor implements VideoProcessor {
  id = 'my-processor'
  name = 'My Processor'
  description = 'Analyzes video frames for something cool'
  enabled = false

  async process(
    frame: ImageData,
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement
  ): Promise<ProcessorResult | null> {
    // Your processing logic here
    const { width, height, data } = frame
    
    // Example: count bright pixels
    let brightPixels = 0
    for (let i = 0; i < data.length; i += 4) {
      const brightness = (data[i] + data[i+1] + data[i+2]) / 3
      if (brightness > 200) brightPixels++
    }

    return {
      id: `my-${Date.now()}`,
      processorId: this.id,
      timestamp: Date.now(),
      data: {
        brightPixels,
        percentage: ((brightPixels / (width * height)) * 100).toFixed(2)
      }
    }
  }
}

// Register the processor
processorRegistry.register(new MyProcessor())
```

2. Import it in `lib/video-processors/index.ts`:

```typescript
import './my-processor'
```

3. The processor will appear in the dashboard's "Processors" tab.

## VideoProcessor Interface

```typescript
interface VideoProcessor {
  id: string           // Unique identifier
  name: string         // Display name in UI
  description: string  // What this processor does
  enabled: boolean     // Whether it's currently active

  // Optional: Initialize resources (load ML models, etc.)
  init?(): Promise<void>

  // Process a video frame - called ~10 times per second
  process(
    frame: ImageData,           // Raw pixel data (RGBA)
    canvas: HTMLCanvasElement,  // For drawing overlays
    video: HTMLVideoElement     // Video element reference
  ): Promise<ProcessorResult | null>

  // Optional: Cleanup when disabled
  destroy?(): Promise<void>
}
```

## ProcessorResult Structure

```typescript
interface ProcessorResult {
  id: string              // Unique result ID
  processorId: string     // Your processor's ID
  timestamp: number       // When processing completed

  // Optional: Bounding boxes to draw on video
  boundingBoxes?: BoundingBox[]

  // Optional: Key-value data to display in UI
  data?: Record<string, any>

  // Optional: Alert message
  message?: string
}

interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
  label?: string      // Text label above box
  confidence?: number // 0-1 confidence score
  color?: string      // CSS color (default: magenta)
}
```

## Examples

### Drawing Bounding Boxes

```typescript
async process(frame, canvas, video) {
  // Detect something at position (100, 50)
  return {
    id: `detection-${Date.now()}`,
    processorId: this.id,
    timestamp: Date.now(),
    boundingBoxes: [{
      x: 100,
      y: 50,
      width: 200,
      height: 300,
      label: 'Object detected',
      confidence: 0.95,
      color: '#00FF00'
    }]
  }
}
```

### Using TensorFlow.js

```typescript
import * as tf from '@tensorflow/tfjs'
import { VideoProcessor } from './types'

class ObjectDetector implements VideoProcessor {
  id = 'tf-detector'
  name = 'TensorFlow Object Detector'
  description = 'Detects objects using a pre-trained model'
  enabled = false
  
  private model: tf.GraphModel | null = null

  async init() {
    this.model = await tf.loadGraphModel('/models/ssd_mobilenet/model.json')
  }

  async process(frame, canvas, video) {
    if (!this.model) return null
    
    const tensor = tf.browser.fromPixels(video)
    const predictions = await this.model.predict(tensor)
    tensor.dispose()
    
    // Convert predictions to bounding boxes...
    return { ... }
  }

  async destroy() {
    this.model?.dispose()
    this.model = null
  }
}
```

### Stateful Processing (Frame Comparison)

```typescript
class MotionDetector implements VideoProcessor {
  id = 'motion'
  name = 'Motion Detector'
  description = 'Detects motion between frames'
  enabled = false
  
  private previousFrame: ImageData | null = null

  async process(frame, canvas, video) {
    if (!this.previousFrame) {
      this.previousFrame = new ImageData(
        new Uint8ClampedArray(frame.data),
        frame.width,
        frame.height
      )
      return null
    }

    // Compare current frame with previous
    let diff = 0
    for (let i = 0; i < frame.data.length; i += 4) {
      diff += Math.abs(frame.data[i] - this.previousFrame.data[i])
    }

    // Store current frame for next comparison
    this.previousFrame = new ImageData(
      new Uint8ClampedArray(frame.data),
      frame.width,
      frame.height
    )

    return {
      id: `motion-${Date.now()}`,
      processorId: this.id,
      timestamp: Date.now(),
      data: { motionScore: diff },
      message: diff > 1000000 ? 'Motion detected!' : undefined
    }
  }

  async destroy() {
    this.previousFrame = null
  }
}
```

## Built-in Processors

| Processor | Description |
|-----------|-------------|
| `amazon-logo-game` | Interactive game - catch boxes with your hand using MediaPipe hand tracking |
| `motion-heatmap` | Visualizes motion as a color heatmap overlay |
| `brightness-analyzer` | Analyzes frame brightness and highlights bright/dark regions |

## Hand Tracking with MediaPipe

The `amazon-logo-game` processor demonstrates how to integrate MediaPipe Hands for real-time hand detection:

```typescript
import { VideoProcessor } from './types'

class HandTrackingProcessor implements VideoProcessor {
  id = 'hand-tracker'
  name = 'Hand Tracker'
  description = 'Tracks hands using MediaPipe'
  enabled = false

  private hands: any = null
  private ready = false
  private handPosition: { x: number; y: number } | null = null

  async init() {
    const { Hands } = await import('@mediapipe/hands')
    
    this.hands = new Hands({
      locateFile: (file: string) => 
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    })

    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0, // 0 = lite (fastest)
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })

    this.hands.onResults((results: any) => {
      if (results.multiHandLandmarks?.[0]) {
        const tip = results.multiHandLandmarks[0][8] // Index finger tip
        this.handPosition = { x: tip.x, y: tip.y }
      } else {
        this.handPosition = null
      }
    })

    await this.hands.initialize()
    this.ready = true
  }

  async process(frame, canvas, video) {
    if (this.ready) {
      await this.hands.send({ image: video })
    }
    
    return {
      id: `hand-${Date.now()}`,
      processorId: this.id,
      timestamp: Date.now(),
      data: { handDetected: !!this.handPosition }
    }
  }

  async destroy() {
    this.hands?.close()
    this.hands = null
    this.ready = false
  }
}
```

MediaPipe loads models from CDN automatically - no local model files needed.

## Tips

- Keep `process()` fast - it runs ~10 times per second
- Use `init()` for expensive setup (loading models)
- Use `destroy()` to clean up resources when disabled
- Return `null` if there's nothing to report
- Coordinates in `boundingBoxes` are in video pixels (not canvas pixels)
- The system handles scaling bounding boxes to the display canvas
