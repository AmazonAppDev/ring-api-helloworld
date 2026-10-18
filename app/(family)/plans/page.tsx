import { callTool, getState, when, type JiraniState, type Plan } from '@/lib/jirani'
import { Card, JiraniUnavailable, PageTitle } from '../components/ui'
import { cancelPlan } from './actions'

export const dynamic = 'force-dynamic'

const KIND_WORDS: Record<Plan['kind'], string> = {
  away: 'Away',
  late_start: 'Late start',
  visitor_expected: 'Visitor expected',
  note: 'Note',
}

export default async function Plans() {
  let s: JiraniState, plans: Plan[]
  try {
    ;[s, plans] = await Promise.all([getState(), callTool<{ plans: Plan[] }>('list_plans').then((r) => r.data?.plans ?? [])])
  } catch (e) {
    return <JiraniUnavailable error={e} />
  }
  const tz = s.household.timeZone
  const name = s.household.residentName

  return (
    <>
      <PageTitle sub={`Plans keep Jirani quiet when ${name} is away or expecting someone. ${name} usually adds them by voice.`}>
        Plans
      </PageTitle>
      {plans.length === 0 && (
        <Card tone="calm">
          <p className="font-medium text-teal-900">No current or upcoming plans.</p>
        </Card>
      )}
      {plans.map((p) => (
        <Card key={p.id}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {KIND_WORDS[p.kind]} · added by {p.createdBy === 'resident' ? name : 'family'}
          </p>
          <p className="mt-1 font-medium">“{p.text}”</p>
          <p className="mt-1 text-sm text-slate-600">
            {when(p.startsAt, tz)} → {when(p.endsAt, tz)}
          </p>
          <form action={cancelPlan} className="mt-3">
            <input type="hidden" name="id" value={p.id} />
            <button type="submit" className="min-h-11 rounded-xl border border-stone-300 px-4 text-sm font-medium text-slate-700 hover:bg-stone-100">
              Cancel this plan
            </button>
          </form>
        </Card>
      ))}
    </>
  )
}
