'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/', label: 'Today' },
  { href: '/alerts', label: 'Alerts' },
  { href: '/week', label: 'Week' },
  { href: '/messages', label: 'Messages' },
  { href: '/plans', label: 'Plans' },
]

export function Nav() {
  const path = usePathname()
  return (
    <nav aria-label="Dashboard" className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white">
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {TABS.map((t) => {
          const active = t.href === '/' ? path === '/' : path.startsWith(t.href)
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 items-center justify-center text-sm font-medium ${
                  active ? 'text-teal-800 underline decoration-2 underline-offset-8' : 'text-slate-500'
                }`}
              >
                {t.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
