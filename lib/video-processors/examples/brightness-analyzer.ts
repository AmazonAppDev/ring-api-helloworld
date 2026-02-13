import { VideoProcessor, ProcessorResult, BoundingBox } from '../types'

/**
 * Example Processor: Brightness Analyzer
 * 
 * Analyzes frame brightness and detects bright/dark regions.
 * Simple example showing how to return bounding boxes.
 */
export class BrightnessAnalyzerProcessor implements VideoProcessor {
  id = 'brightness-analyzer'
  name = 'Brightness Analyzer'
  description = 'Analyzes frame brightness and highlights bright/dark regions'
  enabled = false

  private readonly GRID_SIZE = 8 // Divide frame into 8x8 grid

  async process(
    frame: ImageData,
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement
  ): Promise<ProcessorResult | null> {
    const { width, height, data } = frame
    const cellWidth = Math.floor(width / this.GRID_SIZE)
    const cellHeight = Math.floor(height / this.GRID_SIZE)

    const boundingBoxes: BoundingBox[] = []
    let totalBrightness = 0
    let brightestCell = { x: 0, y: 0, brightness: 0 }
    let darkestCell = { x: 0, y: 0, brightness: 255 }

    // Analyze each grid cell
    for (let gy = 0; gy < this.GRID_SIZE; gy++) {
      for (let gx = 0; gx < this.GRID_SIZE; gx++) {
        let cellBrightness = 0
        let pixelCount = 0

        // Calculate average brightness for this cell
        for (let y = gy * cellHeight; y < (gy + 1) * cellHeight && y < height; y++) {
          for (let x = gx * cellWidth; x < (gx + 1) * cellWidth && x < width; x++) {
            const i = (y * width + x) * 4
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
            cellBrightness += brightness
            pixelCount++
          }
        }

        const avgBrightness = cellBrightness / pixelCount
        totalBrightness += avgBrightness

        // Track brightest and darkest cells
        if (avgBrightness > brightestCell.brightness) {
          brightestCell = { x: gx * cellWidth, y: gy * cellHeight, brightness: avgBrightness }
        }
        if (avgBrightness < darkestCell.brightness) {
          darkestCell = { x: gx * cellWidth, y: gy * cellHeight, brightness: avgBrightness }
        }
      }
    }

    const avgFrameBrightness = totalBrightness / (this.GRID_SIZE * this.GRID_SIZE)

    // Add bounding boxes for brightest and darkest regions
    if (brightestCell.brightness > 200) {
      boundingBoxes.push({
        x: brightestCell.x,
        y: brightestCell.y,
        width: cellWidth,
        height: cellHeight,
        label: `Bright: ${brightestCell.brightness.toFixed(0)}`,
        color: '#FFFF00',
        confidence: brightestCell.brightness / 255,
      })
    }

    if (darkestCell.brightness < 50) {
      boundingBoxes.push({
        x: darkestCell.x,
        y: darkestCell.y,
        width: cellWidth,
        height: cellHeight,
        label: `Dark: ${darkestCell.brightness.toFixed(0)}`,
        color: '#4444FF',
        confidence: 1 - darkestCell.brightness / 255,
      })
    }

    return {
      id: `brightness-${Date.now()}`,
      processorId: this.id,
      timestamp: Date.now(),
      boundingBoxes,
      data: {
        avgBrightness: avgFrameBrightness.toFixed(1),
        brightest: brightestCell.brightness.toFixed(0),
        darkest: darkestCell.brightness.toFixed(0),
        exposure: avgFrameBrightness < 80 ? 'Underexposed' : 
                  avgFrameBrightness > 180 ? 'Overexposed' : 'Good',
      },
    }
  }
}

export const brightnessAnalyzerProcessor = new BrightnessAnalyzerProcessor()
