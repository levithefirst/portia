import { useEffect, useState, type ReactNode } from 'react'
import { applyTheme, getTheme, type ThemePref } from '../lib/storage'
import { IconMonitor, IconMoon, IconSun } from './icons'

export type Route = 'home' | 'check' | 'privacy'

const PATHS: Record<Route, string> = { home: '/', check: '/app', privacy: '/privacy' }

export function navigate(to: Route) {
  const path = PATHS[to]
  if (location.pathname !== path || location.search) history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo({ top: 0 })
}

/** "/" is the landing page; the tool lives at /app (and /check). Any ?judge=1 URL opens the tool in Judge Mode. */
export function routeFromPath(): Route {
  const p = location.pathname
  if (p.startsWith('/privacy')) return 'privacy'
  if (p.startsWith('/app') || p.startsWith('/check')) return 'check'
  const q = new URLSearchParams(location.search)
  if (q.get('judge') === '1' || (q.has('judge') && q.get('judge') !== '0')) return 'check'
  return 'home'
}

function NavLink({ to, current, children }: { to: Route; current: Route; children: ReactNode }) {
  return (
    <a
      href={PATHS[to]}
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

/** The Portia mark: a solid #247D97 disc with one wedge cut from the top. Colour is locked in both themes. */
export function LogoMark({ size = 26, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={Math.max(16, size)}
      height={Math.max(16, size)}
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className="logo-mark shrink-0"
    >
      <path d="M32 45.5L29.43 2.11A30 30 0 1 0 34.57 2.11Z" fill="#247D97" />
    </svg>
  )
}

export function Wordmark({ size = 26 }: { size?: number }) {
  // Clear space: gap >= 25% of the mark width.
  return (
    <span className="flex items-center" style={{ gap: Math.ceil(size * 0.3) }}>
      <LogoMark size={size} />
      <span className="font-serif text-[1.6rem] leading-none font-medium tracking-[-0.01em] text-text">Portia</span>
    </span>
  )
}

export function Header({ route }: { route: Route }) {
  return (
    <header className="site-header no-print border-b border-border-subtle">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <a
          href="/"
          className="no-underline"
          onClick={(e) => {
            e.preventDefault()
            navigate('home')
          }}
          aria-label="Portia home"
        >
          <Wordmark />
        </a>
        <nav aria-label="Main" className="flex items-center gap-1">
          <NavLink to="privacy" current={route}>
            Privacy
          </NavLink>
          <ThemeToggle />
          {route === 'home' ? (
            <a
              href="/app"
              className="btn btn-primary ml-1 px-3.5 py-1.5 text-sm no-underline"
              onClick={(e) => {
                e.preventDefault()
                navigate('check')
              }}
            >
              Check a lease
            </a>
          ) : (
            <NavLink to="check" current={route}>
              Check a lease
            </NavLink>
          )}
        </nav>
      </div>
    </header>
  )
}

export function Footer({ children }: { children?: ReactNode }) {
  return (
    <footer className="mt-16 border-t border-border-subtle">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-text-secondary sm:px-6">
        <div className="mb-4">
          <Wordmark size={22} />
        </div>
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
