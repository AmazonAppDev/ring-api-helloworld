import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ring API sample · Live Detection Dashboard',
  description: "Amazon's ring-api-helloworld sample: live video and real-time detection.",
}

/** The original sample's dark theme, scoped to /sample so the family dashboard can stay light. */
export default function SampleLayout({ children }: { children: React.ReactNode }) {
  return <div className="dark min-h-screen bg-dash-dark text-slate-200">{children}</div>
}
