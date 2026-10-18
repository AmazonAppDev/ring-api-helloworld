import './globals.css'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Jirani · the neighbour who notices',
  description: "Margaret's day at a glance: rhythm, alerts and the weekly report, from Ring sensors, never video by default.",
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0f766e' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
