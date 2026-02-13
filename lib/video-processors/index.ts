/**
 * Video Processor Plugin System
 * 
 * Usage:
 * 
 * 1. Create a processor implementing VideoProcessor interface:
 * 
 *    import { VideoProcessor, ProcessorResult } from '@/lib/video-processors'
 *    
 *    class MyProcessor implements VideoProcessor {
 *      id = 'my-processor'
 *      name = 'My Processor'
 *      description = 'Does something cool'
 *      enabled = false
 *      
 *      async process(frame, canvas, video) {
 *        // Your processing logic here
 *        return { id: '...', processorId: this.id, timestamp: Date.now(), ... }
 *      }
 *    }
 * 
 * 2. Register it:
 * 
 *    import { processorRegistry } from '@/lib/video-processors'
 *    processorRegistry.register(new MyProcessor())
 * 
 * 3. Enable it from the UI or programmatically:
 * 
 *    processorRegistry.setEnabled('my-processor', true)
 */

export * from './types'
export { processorRegistry } from './registry'

// Register built-in example processors
import { motionHeatmapProcessor } from './examples/motion-heatmap'
import { brightnessAnalyzerProcessor } from './examples/brightness-analyzer'
import { amazonLogoGame } from './examples/amazon-logo-game'
import { processorRegistry } from './registry'

// Auto-register example processors
processorRegistry.register(motionHeatmapProcessor)
processorRegistry.register(brightnessAnalyzerProcessor)
processorRegistry.register(amazonLogoGame)
