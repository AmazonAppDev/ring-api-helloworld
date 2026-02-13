'use client'

import { VideoProcessor, ProcessorResult } from '@/lib/video-processors/types'

interface ProcessorPanelProps {
  processors: VideoProcessor[]
  results: Map<string, ProcessorResult>
  onToggle: (id: string) => void
}

export function ProcessorPanel({ processors, results, onToggle }: ProcessorPanelProps) {
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      <p className="text-xs text-slate-500 mb-2">
        Enable video processors to analyze the live stream in real-time.
      </p>

      {processors.map((processor) => {
        const result = results.get(processor.id)
        return (
          <div key={processor.id} className="card">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-medium text-white">{processor.name}</h3>
                <p className="text-xs text-slate-500">{processor.description}</p>
              </div>
              <button
                onClick={() => onToggle(processor.id)}
                className={`px-3 py-1 text-xs rounded font-medium transition ${
                  processor.enabled
                    ? 'bg-purple-600 text-white'
                    : 'bg-dash-card text-slate-400 hover:bg-slate-600'
                }`}
              >
                {processor.enabled ? 'ON' : 'OFF'}
              </button>
            </div>

            {processor.enabled && result?.data && (
              <div className="mt-2 p-2 bg-dash-dark rounded">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(result.data).map(([key, value]) => {
                    if (key === 'heatmap' || key.startsWith('_')) return null
                    return (
                      <div key={key} className="flex justify-between">
                        <span className="text-slate-500">{key}:</span>
                        <span className="text-purple-300 font-mono">{String(value)}</span>
                      </div>
                    )
                  })}
                </div>
                {result.message && (
                  <p className="mt-2 text-xs text-yellow-400">{result.message}</p>
                )}
              </div>
            )}
          </div>
        )
      })}

      {processors.length === 0 && (
        <p className="text-center text-slate-500 mt-8 text-sm">
          No processors registered.<br />
          <span className="text-xs">Add processors in lib/video-processors/</span>
        </p>
      )}

      {/* How to add processors */}
      <div className="mt-4 p-3 bg-dash-dark rounded border border-slate-700">
        <h4 className="text-xs font-medium text-slate-400 mb-2">Add Your Own Processor</h4>
        <pre className="text-xs text-slate-500 overflow-x-auto">
{`// lib/video-processors/my-processor.ts
import { VideoProcessor } from './types'
import { processorRegistry } from './registry'

class MyProcessor implements VideoProcessor {
  id = 'my-processor'
  name = 'My Processor'
  description = 'Does something cool'
  enabled = false

  async process(frame, canvas, video) {
    return { ... }
  }
}

processorRegistry.register(new MyProcessor())`}
        </pre>
      </div>
    </div>
  )
}
