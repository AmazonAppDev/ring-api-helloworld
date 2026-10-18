import Link from 'next/link'
import { getState, when, type JiraniState } from '@/lib/jirani'
import { Card, JiraniUnavailable, LevelBadge, PageTitle } from './components/ui'

export const dynamic = 'force-dynamic'

export default async function Today() {
  let s: JiraniState
  try {
    s = await getState()
  } catch (e) {
    return <JiraniUnavailable error={e} />
  }
  const name = s.household.residentName
  const tz = s.household.timeZone
  const open = s.escalations.filter((e) => e.status === 'open')
  const f = s.summary.facts

  return (
    <>
      <PageTitle sub={`${when(s.now, tz)} in ${name}'s time zone`}>{name} today</PageTitle>

      {s.paused && (
        <Card tone="paused" title="Paused by Margaret">
          <p className="text-sm">
            {name} paused Jirani until {when(s.paused.until, tz, { date: false })}. You only see that it's paused, not why.
          </p>
        </Card>
      )}

      {open.length > 0 ? (
        open.map((e) => (
          <Card key={e.id} tone="alert">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-semibold">{e.summary}</p>
              <LevelBadge level={e.level} status={e.status} />
            </div>
            <Link href="/alerts" className="text-sm font-medium text-rose-800 underline underline-offset-4">
              See why, and who has been asked
            </Link>
          </Card>
        ))
      ) : (
        !s.paused && (
          <Card tone="calm">
            <p className="font-medium text-teal-900">No open alerts.</p>
          </Card>
        )
      )}

      <Card title="So far today">
        <ul className="space-y-1 text-[15px] leading-relaxed">
          {/* The open alert already has its own card above. */}
          {s.summary.lines.filter((l) => !l.startsWith('Open alerts:')).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Fact label="Up at" value={f.upAt ?? 'Not yet'} hint={`usually ${f.usualUpAt}`} />
          <Fact label="Last activity" value={f.lastActivity ?? '—'} />
          <Fact label="Fridge" value={`${f.fridgeOpenings}×`} />
          <Fact label="Medicine cabinet" value={f.medicine.length ? f.medicine.join(', ') : 'Not yet'} />
          <Fact label="Trips out" value={String(f.trips)} />
          <Fact label="Visitors" value={String(f.visitors)} />
        </dl>
        {f.activeContext.length > 0 && <p className="mt-3 text-sm text-slate-600">Plans today: {f.activeContext.join('; ')}</p>}
      </Card>

      {s.suppressed.length > 0 && (
        <Card title="Why Jirani stayed quiet">
          <ul className="space-y-2 text-sm">
            {s.suppressed.map((x) => (
              <li key={x.summary}>
                {x.summary} <span className="text-slate-500">({x.reason})</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {s.notices.length > 0 && (
        <Card title="Notices">
          <ul className="space-y-2 text-sm">
            {s.notices.map((n) => (
              <li key={n.message}>{n.message}</li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-stone-100 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-base font-semibold">{value}</dd>
      {hint && <dd className="text-xs text-slate-500">{hint}</dd>}
    </div>
  )
}
