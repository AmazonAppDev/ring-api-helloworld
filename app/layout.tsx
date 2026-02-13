import './globals.css'

export const metadata = {
  title: 'Live Detection Dashboard',
  description: 'Real-time AI-powered camera detection demo',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-dash-dark text-slate-200">
        {children}
      </body>
    </html>
  )
}
