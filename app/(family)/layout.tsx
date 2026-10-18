import { Nav } from './components/Nav'

/** Amina's dashboard: light, phone-first, one column, tabs at the bottom where a thumb reaches. */
export default function FamilyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-lg font-semibold tracking-tight text-teal-800">Jirani</p>
            <p className="text-xs text-slate-500">the neighbour who notices</p>
          </div>
          <p className="text-right text-xs text-slate-500">
            Ring sensors only
            <br />
            never video by default
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-28 pt-4">{children}</main>
      <Nav />
    </div>
  )
}
