# Ring API Hello World 

A real-time video streaming dashboard with WebRTC, webhook event processing, and extensible video processors including hand-tracking games,
using the brand new [Ring API](https://developer.amazon.com/ring)

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![MediaPipe](https://img.shields.io/badge/MediaPipe-Hands-green)

## Features

- **Live Video Streaming** - WebRTC-based video streaming with low latency
- **Webhook Events** - Real-time SSE (Server-Sent Events) for Ring camera webhooks
- **Video Processors** - Plugin system for real-time video analysis
- **Hand Tracking Game** - Catch-the-box game using MediaPipe hand detection
- **Canvas Overlays** - Bounding boxes, heatmaps, and visual effects

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your configuration and add the token to access your Ring API

# Start development server
npm run dev

# Build for production
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Architecture

```
app/
├── page.tsx                 # Main dashboard (composable components)
├── components/
│   ├── Header.tsx           # Status bar
│   ├── EventCard.tsx        # Webhook event display
│   ├── EventPanel.tsx       # Event list with filtering
│   ├── ProcessorPanel.tsx   # Processor toggle UI
│   └── ErrorBoundary.tsx    # Error handling
├── hooks/
│   ├── useWebRTCStream.ts   # WebRTC connection management
│   ├── useEventStream.ts    # SSE with auto-reconnect
│   └── useCanvasOverlay.ts  # Optimized render loop
└── api/
    ├── webhook/             # Webhook receiver + SSE endpoint
    └── ring/                # Ring API integration

lib/
├── video-processors/
│   ├── types.ts             # VideoProcessor interface
│   ├── registry.ts          # Processor registration
│   └── examples/            # Built-in processors
├── schemas/
│   └── webhook.ts           # Zod validation schemas
└── sse-broadcast.ts         # SSE client management
```

## Video Processors

Built-in processors:

| Processor              | Description                          |
| ---------------------- | ------------------------------------ |
| 🎯 Catch the Logo      | Hand-tracking game with fire effects |
| 🌡️ Motion Heatmap      | Visualizes motion as color overlay   |
| 💡 Brightness Analyzer | Analyzes frame brightness levels     |

### Creating Custom Processors

```typescript
// lib/video-processors/my-processor.ts
import {VideoProcessor, ProcessorResult} from './types';
import {processorRegistry} from './registry';

class MyProcessor implements VideoProcessor {
  id = 'my-processor';
  name = 'My Processor';
  description = 'Does something cool';
  enabled = false;

  async process(
    frame: ImageData,
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
  ): Promise<ProcessorResult | null> {
    // Your processing logic
    return {
      id: `my-${Date.now()}`,
      processorId: this.id,
      timestamp: Date.now(),
      data: {
        /* metrics */
      },
      boundingBoxes: [{x: 0, y: 0, width: 100, height: 100, label: 'Detected'}],
    };
  }
}

processorRegistry.register(new MyProcessor());
```

See [docs/video-processors.md](docs/video-processors.md) for the complete guide.

## Webhook Integration

The dashboard receives webhook events via POST and broadcasts them to connected clients via SSE.

```bash
# Send a test event
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"event_type": "motion_detected", "device_id": "camera-1"}'

# Or use the built-in test endpoint
curl -X POST http://localhost:3000/api/webhook/test
```

### Ring Camera Webhooks

Configure your Ring webhook to POST to `/api/webhook`. The dashboard normalizes Ring's JSON:API format automatically.

Set `RING_WEBHOOK_SECRET` in `.env.local` for authentication:

```env
RING_WEBHOOK_SECRET=your-secret-token
```

## Environment Variables

| Variable                     | Description                   | Required |
| ---------------------------- | ----------------------------- | -------- |
| `RING_WEBHOOK_SECRET`        | Bearer token for webhook auth | No       |
| `NEXT_PUBLIC_RING_DEVICE_ID` | Default device ID for testing | No       |

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Hand Detection**: MediaPipe Hands
- **Validation**: Zod
- **Streaming**: WebRTC, Server-Sent Events

## Development

```bash
# Run development server with hot reload
npm run dev

# Type checking
npx tsc --noEmit

# Build production bundle
npm run build
```

## License

[MIT](LICENSE)
