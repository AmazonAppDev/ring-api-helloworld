import { JiraniError, type LadderAction } from '@/lib/jirani'

export function Card({ title, children, tone = 'plain' }: { title?: string; children: React.ReactNode; tone?: 'plain' | 'alert' | 'calm' | 'paused' }) {
  const tones = {
    plain: 'border-stone-200 bg-white',
    alert: 'border-rose-300 bg-rose-50',
    calm: 'border-teal-200 bg-teal-50',
    paused: 'border-amber-300 bg-amber-50',
  }
  return (
    <section className={`mb-4 rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
      {title && <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h2>}
      {children}
    </section>
  )
}

export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
      {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
    </div>
  )
}

/** Shown instead of a page when Jirani can't be reached, so the cause is obvious. */
export function JiraniUnavailable({ error }: { error: unknown }) {
  const message = error instanceof JiraniError ? error.message : 'Something went wrong talking to Jirani.'
  return (
    <Card title="Jirani isn't answering" tone="alert">
      <p className="text-sm">{message}</p>
    </Card>
  )
}

export const ACTION_WORDS: Record<LadderAction['type'], string> = {
  log: 'Noted',
  checkin_resident: 'Check-in (voice + TV)',
  notify_contact: 'Message',
  offer_live_view: 'Front-door camera offered',
  suggest_emergency: 'Problem reported',
  all_clear: 'All clear',
}

/** "joe" → "Joe", "resident" → the resident's name. */
export function recipient(to: string | undefined, residentName: string): string {
  if (!to || to === 'family') return 'Family'
  if (to === 'resident') return residentName
  return to.charAt(0).toUpperCase() + to.slice(1)
}

export function LevelBadge({ level, status }: { level: number; status: string }) {
  const open = status === 'open'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
        open ? 'bg-rose-600 text-white' : 'bg-stone-200 text-slate-700'
      }`}
    >
      {open ? `Open · level ${level}` : 'Resolved'}
    </span>
  )
}
