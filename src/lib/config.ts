import { useEffect, useState } from 'react'

/**
 * Runtime config from Firebase Remote Config, with safe defaults. The defaults
 * are used whenever Remote Config is missing, slow (over 1.5 s), invalid, or
 * skipped (e2e and no-key builds). Fetching never blocks first paint, Judge
 * Mode warm-up or the one click; model instances created before it resolves
 * keep the defaults for that session.
 */
export const DEFAULT_CLOUD_MODEL = 'gemini-3.5-flash-lite'
export const MODEL_ALLOWLIST = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'] as const
export const TIMEOUT_MIN_MS = 3000
export const TIMEOUT_MAX_MS = 20000
export const RC_FETCH_RACE_MS = 1500
export const RC_MIN_FETCH_INTERVAL_MS = 3600000

/** Remote Config template keys (create these in the Firebase console). */
export const RC_KEYS = {
  cloudModel: 'cloud_model',
  judgeTimeoutMs: 'judge_timeout_ms',
  extractThinRetry: 'extract_thin_retry',
  playbookMinVersion: 'playbook_min_version',
} as const

export const RC_DEFAULTS: Record<string, string | number | boolean> = {
  cloud_model: DEFAULT_CLOUD_MODEL,
  judge_timeout_ms: 8000,
  extract_thin_retry: true,
  playbook_min_version: '',
}

export interface PortiaConfig {
  cloudModel: string
  judgeTimeoutMs: number
  extractThinRetry: boolean
  playbookMinVersion: string
  source: 'remote' | 'default'
}

type Raw = Partial<Record<(typeof RC_KEYS)[keyof typeof RC_KEYS], string | number | boolean | undefined | null>>

/** Validates raw values. Anything missing or invalid falls back to the default. */
export function sanitizeConfig(raw: Raw): Omit<PortiaConfig, 'source'> {
  const model = String(raw.cloud_model ?? '').trim()
  const t = Number(raw.judge_timeout_ms)
  const retryRaw = raw.extract_thin_retry
  const retry =
    typeof retryRaw === 'boolean' ? retryRaw : String(retryRaw ?? '').trim().toLowerCase() === 'false' ? false : true
  const minV = String(raw.playbook_min_version ?? '').trim()
  return {
    cloudModel: (MODEL_ALLOWLIST as readonly string[]).includes(model) ? model : DEFAULT_CLOUD_MODEL,
    judgeTimeoutMs:
      raw.judge_timeout_ms === undefined || raw.judge_timeout_ms === null || raw.judge_timeout_ms === '' || !Number.isFinite(t)
        ? 8000
        : Math.min(TIMEOUT_MAX_MS, Math.max(TIMEOUT_MIN_MS, Math.round(t))),
    extractThinRetry: retry,
    playbookMinVersion: /^\d{4}-\d{2}$/.test(minV) ? minV : '',
  }
}

let current: PortiaConfig = { ...sanitizeConfig({}), source: 'default' }
const listeners = new Set<(c: PortiaConfig) => void>()

export function getConfig(): PortiaConfig {
  return current
}

export function setConfig(c: PortiaConfig) {
  current = c
  listeners.forEach((l) => l(c))
}

export function useConfig(): PortiaConfig {
  const [c, setC] = useState(current)
  useEffect(() => {
    listeners.add(setC)
    setC(current)
    return () => {
      listeners.delete(setC)
    }
  }, [])
  return c
}

/** True when a bundled playbook version is older than the published minimum (YYYY-MM). */
export function playbookOutdated(min: string, versions: string[]): boolean {
  return !!min && versions.some((v) => v < min)
}
