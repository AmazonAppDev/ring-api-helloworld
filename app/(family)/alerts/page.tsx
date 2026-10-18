import { callTool, getState, when, type JiraniState } from '@/lib/jirani'
import { ACTION_WORDS, Card, JiraniUnavailable, LevelBadge, PageTitle, recipient } from '../components/ui'

export const dynamic = 'force-dynamic'

export default async function Alerts() {
  let s: JiraniState
  try {
    s = await getState()
  } catch (e) {
    return <JiraniUnavailable error={e} />
  }
  const tz = s.household.timeZone
  const name = s.household.residentName
  // Newest first; open ones before resolved ones.
  const alerts = [...s.escalations].sort((a, b) =>
    a.status === b.status ? b.openedAt.localeCompare(a.openedAt) : a.status === 'open' ? -1 : 1,
  )
  // Jirani's own explanation for each (the same words the voice assistant uses).
  // Only its evidence part: the steps it lists are drawn as a timeline below.
  const why = await Promise.all(
    alerts.map((e) =>
      callTool('why_alert', { escalation_id: e.id })
        .then((r) => r.text.split(' What Jirani did, in order:')[0]!.replace(e.summary, '').trim())
        .catch(() => null),
    ),
  )

  return (
    <>
      <PageTitle sub="Statistics decide when something is off. Jirani always asks her first.">Alerts</PageTitle>
      {alerts.length === 0 && (
        <Card tone="calm">
          <p className="font-medium text-teal-900">No alerts yet.</p>
        </Card>
      )}
      {alerts.map((e, i) => (
        <Card key={e.id} tone={e.status === 'open' ? 'alert' : 'plain'}>
          <div className="mb-1 flex items-start justify-between gap-2">
            <p className="font-semibold">{e.summary}</p>
            <LevelBadge level={e.level} status={e.status} />
          </div>
          <p className="mb-3 text-xs text-slate-500">Opened {when(e.openedAt, tz)}</p>

          {why[i] && <p className="mb-3 text-[15px] leading-relaxed">{why[i]}</p>}

          <ol className="space-y-2 border-l-2 border-stone-300 pl-4">
            {e.history.map((step) => (
              <li key={step.at + step.level}>
                <p className="text-xs font-semibold text-slate-600">
                  {when(step.at, tz, { date: false })} · level {step.level}
                  {step.note ? ` · ${step.note}` : ''}
                </p>
                <ul className="text-sm">
                  {step.actions.map((a) => (
                    <li key={a.type + (a.to ?? '')}>
                      {ACTION_WORDS[a.type]}
                      {a.to ? ` → ${recipient(a.to, name)}` : ''}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          {e.resolution && (
            <p className="mt-3 text-sm text-teal-900">
              Resolved {when(e.resolution.at, tz, { date: false })} by {e.resolution.by}: “{e.resolution.note}”
            </p>
          )}
        </Card>
      ))}
    </>
  )
}
