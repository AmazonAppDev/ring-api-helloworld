import './globals.css'

export const metadata = {
  title: 'Live Detection Dashboard',
  description: 'Real-time AI-powered camera detection demo',
}

// The dark theme now lives in app/sample/layout.tsx, so other routes can choose their own.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
