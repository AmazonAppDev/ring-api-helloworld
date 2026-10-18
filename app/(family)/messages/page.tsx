import { getState, when, type JiraniState } from '@/lib/jirani'
import { ACTION_WORDS, Card, JiraniUnavailable, PageTitle, recipient } from '../components/ui'

export const dynamic = 'force-dynamic'

export default async function Messages() {
  let s: JiraniState
  try {
    s = await getState()
  } catch (e) {
    return <JiraniUnavailable error={e} />
  }
  const tz = s.household.timeZone
  const messages = [...s.outbox].reverse()

  return (
    <>
      <PageTitle sub="Everything Jirani said, to whom, newest first.">Messages</PageTitle>
      {messages.length === 0 && (
        <Card tone="calm">
          <p className="font-medium text-teal-900">Jirani hasn&apos;t needed to contact anyone.</p>
        </Card>
      )}
      {messages.map((m) => (
        <Card key={m.at + m.type + m.to}>
          <p className="text-xs font-semibold text-slate-600">
            {when(m.at, tz)} · {ACTION_WORDS[m.type]} → {recipient(m.to, s.household.residentName)}
          </p>
          <p className="mt-1 text-[15px] leading-relaxed">{m.message}</p>
        </Card>
      ))}
    </>
  )
}
