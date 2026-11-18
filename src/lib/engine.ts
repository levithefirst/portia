import type { DeviceAvailability } from './onDevice'
import type { ImagePart, SourceLabel } from './types'

/**
 * The narrow interface the UI uses to reach a model. The production engine is
 * Firebase AI Logic (engine.firebase.ts). The "e2e" build mode swaps in a
 * fake engine so the smoke test can exercise every UI state without keys.
 */
export interface AiEngine {
  kind: 'firebase' | 'fake'
  availability(): Promise<DeviceAvailability>
  /** Must be called from a user gesture. Resolves when the model is ready or not downloadable. */
  prepareDevice(onProgress: (value: number) => void): Promise<void>
  willRunOnDevice(prompt: string, mimeTypes: string[]): Promise<boolean>
  /**
   * Judge Mode pre-warm: initialise Firebase, App Check and both model
   * instances, and attach to Gemini Nano only if it is already downloaded
   * (a download would need a user gesture). Never blocks the page.
   */
  warmUp(): Promise<void>
  /** rawSource is the exact result.response.inferenceSource string from the SDK (undefined if absent). */
  extract(prompt: string, images: ImagePart[]): Promise<{ text: string; source: SourceLabel; rawSource?: string }>
  check(prompt: string): Promise<{ text: string; source: SourceLabel; rawSource?: string }>
}

/** Maps the SDK's InferenceSource values ("on_device" / "in_cloud") to the label shown on screen. */
export function toSourceLabel(v: string | undefined): SourceLabel {
  const s = (v ?? '').toLowerCase()
  if (s === 'on_device') return 'ON_DEVICE'
  return 'IN_CLOUD'
}
