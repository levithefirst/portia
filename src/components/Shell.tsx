import { useEffect, useState, type ReactNode } from 'react'
import { applyTheme, getTheme, type ThemePref } from '../lib/storage'
import { IconMonitor, IconMoon, IconSun } from './icons'

export type Route = 'check' | 'privacy'

export function navigate(to: Route) {
  const path = to === 'privacy' ? '/privacy' : '/'
  if (location.pathname !== path) history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0 })
}

export function routeFromPath(): Route {
  return location.pathname.startsWith('/privacy') ? 'privacy' : 'check'
}

function NavLink({ to, current, children }: { to: Route; current: Route; children: ReactNode }) {
  return (
    <a
      href={to === 'privacy' ? '/privacy' : '/'}
      aria-current={current === to ? 'page' : undefined}
      onClick={(e) => {
        e.preventDefault()
        navigate(to)
      }}
      className={`rounded-md px-2.5 py-1.5 text-sm no-underline ${current === to ? 'text-text font-semibold' : 'text-text-secondary hover:text-text'}`}
    >
      {children}
    </a>
  )
}

const NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }

function ThemeToggle() {
  const [t, setT] = useState<ThemePref>('system')
  useEffect(() => setT(getTheme()), [])
  const Icon = t === 'light' ? IconSun : t === 'dark' ? IconMoon : IconMonitor
  return (
    <button
      type="button"
      className="btn btn-ghost px-2.5 py-1.5 text-sm"
      onClick={() => {
        const n = NEXT[t]
        applyTheme(n)
        setT(n)
      }}
      aria-label={`Theme: ${t}. Switch to ${NEXT[t]}`}
    >
      <Icon />
      <span className="hidden sm:inline capitalize">{t}</span>
    </button>
  )
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="var(--accent)" />
        <path d="M22 48V16h12.5c6.6 0 11 4 11 10s-4.4 10-11 10H29v12z" fill="none" stroke="var(--on-accent)" strokeWidth="5" strokeLinejoin="round" />
      </svg>
      <span className="font-serif text-[1.6rem] leading-none font-medium tracking-tight text-text">Portia</span>
    </span>
  )
}

export function Header({ route }: { route: Route }) {
  return (
    <header className="no-print border-b border-border-subtle">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <a
          href="/"
          className="no-underline"
          onClick={(e) => {
            e.preventDefault()
            navigate('check')
          }}
          aria-label="Portia home"
        >
          <Wordmark />
        </a>
        <nav aria-label="Main" className="flex items-center gap-1">
          <NavLink to="check" current={route}>
            Check a lease
          </NavLink>
          <NavLink to="privacy" current={route}>
            Privacy
          </NavLink>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  )
}

export function Footer({ children }: { children?: ReactNode }) {
  return (
    <footer className="mt-16 border-t border-border-subtle">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-text-secondary sm:px-6">
        <p className="text-text">
          <strong>Not legal advice.</strong> Portia flags patterns from a curated, static playbook. It does not know the law
          where you live and cannot tell you whether a term is enforceable. Check with a local tenant union, legal aid
          service or lawyer before relying on any flag.
        </p>
        <div className="no-print mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          {children}
          <a
            href="/privacy"
            onClick={(e) => {
              e.preventDefault()
              navigate('privacy')
            }}
          >
            How your data flows
          </a>
          <span>Built with Firebase AI Logic hybrid inference.</span>
          <span>Apache-2.0</span>
        </div>
      </div>
    </footer>
  )
}
