import type { LeaseExtract, SourceLabel } from './types'

/**
 * Optional "remember my last extract". OFF by default. Stores only the
 * approved JSON and the playbook id in this browser's localStorage. Never
 * stores lease text or page images. Nothing is sent to a server.
 */
const KEY_ON = 'portia.remember'
const KEY_DATA = 'portia.lastApproved'

export interface Remembered {
  extract: LeaseExtract
  playbookId: string
  source: SourceLabel
  savedAt: string
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export const rememberEnabled = () => safe(() => localStorage.getItem(KEY_ON) === '1', false)

export function setRememberEnabled(on: boolean) {
  safe(() => {
    if (on) localStorage.setItem(KEY_ON, '1')
    else {
      localStorage.removeItem(KEY_ON)
      localStorage.removeItem(KEY_DATA)
    }
  }, undefined)
}

export function saveApproved(extract: LeaseExtract, playbookId: string, source: SourceLabel) {
  if (!rememberEnabled()) return
  const v: Remembered = { extract, playbookId, source, savedAt: new Date().toISOString() }
  safe(() => localStorage.setItem(KEY_DATA, JSON.stringify(v)), undefined)
}

export function loadApproved(): Remembered | null {
  if (!rememberEnabled()) return null
  return safe(() => {
    const s = localStorage.getItem(KEY_DATA)
    return s ? (JSON.parse(s) as Remembered) : null
  }, null)
}

export const forgetApproved = () => safe(() => localStorage.removeItem(KEY_DATA), undefined)

export type ThemePref = 'system' | 'light' | 'dark'

export function getTheme(): ThemePref {
  return safe(() => {
    const t = localStorage.getItem('portia.theme')
    return t === 'light' || t === 'dark' ? t : 'system'
  }, 'system' as ThemePref)
}

export function applyTheme(t: ThemePref) {
  const root = document.documentElement
  // Swap every token in one frame: no half-light, half-dark colour transitions.
  root.classList.add('theme-switching')
  setTimeout(() => root.classList.remove('theme-switching'), 50)
  if (t === 'system') delete root.dataset.theme
  else root.dataset.theme = t
  safe(() => {
    if (t === 'system') localStorage.removeItem('portia.theme')
    else localStorage.setItem('portia.theme', t)
  }, undefined)
}
