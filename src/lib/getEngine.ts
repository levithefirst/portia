import type { AiEngine } from './engine'
import { isFirebaseConfigured } from './firebase'

/** Returns the engine for this build, or null when Firebase env vars are missing. */
export async function loadEngine(): Promise<AiEngine | null> {
  if (import.meta.env.MODE === 'e2e') {
    return (await import('./engine.fake')).fakeEngine
  }
  if (!isFirebaseConfigured) return null
  return (await import('./engine.firebase')).firebaseEngine
}
