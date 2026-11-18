import { useEffect, useState } from 'react'

/** Current online state from navigator.onLine, kept live with online/offline events. */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline())
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

/**
 * True when an error means "no network", not "the model said no".
 * Firebase AI Logic wraps a failed fetch as "Error fetching from <url>: Failed to fetch";
 * App Check uses "fetch-network-error"; browsers vary ("NetworkError", "Load failed").
 */
export function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e)
  return /failed to fetch|networkerror|network error|network request failed|load failed|err_internet_disconnected|err_network|fetch-network-error|internet connection appears to be offline/i.test(msg)
}
