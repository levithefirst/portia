/**
 * On-device readiness, checked the same way the Firebase AI Logic SDK checks it.
 *
 * In firebase@13.3.0, a PREFER_ON_DEVICE request runs on-device only when
 *   (a) the Chrome Prompt API global `LanguageModel` exists,
 *   (b) LanguageModel.availability(createOptions) === "available", and
 *   (c) the request is non-empty and any images are image/jpeg or image/png.
 * Otherwise the SDK sends the request to the cloud model. Portia evaluates the
 * same conditions first and asks for consent instead of letting that happen.
 * `LanguageModel.availability()` is the call shown in the official get-started
 * guide (Step 1, optional download).
 */

export const ON_DEVICE_CREATE_OPTIONS = {
  // Same values as the SDK defaults (text in English + image in, English text out).
  expectedInputs: [{ type: 'text' as const, languages: ['en'] }, { type: 'image' as const }],
  expectedOutputs: [{ type: 'text' as const, languages: ['en'] }],
}

export const ON_DEVICE_MIME_TYPES = ['image/jpeg', 'image/png']

export type DeviceAvailability =
  | 'unsupported' // no LanguageModel global: not desktop Chrome 139+ or flag off
  | 'unavailable'
  | 'downloadable'
  | 'downloading'
  | 'available'

interface LanguageModelLike {
  availability(options?: unknown): Promise<string>
}

function languageModel(): LanguageModelLike | undefined {
  const g = globalThis as unknown as { LanguageModel?: LanguageModelLike }
  return g.LanguageModel
}

export async function checkDeviceAvailability(): Promise<DeviceAvailability> {
  const lm = languageModel()
  if (!lm) return 'unsupported'
  try {
    const a = await lm.availability(ON_DEVICE_CREATE_OPTIONS)
    if (a === 'available' || a === 'downloadable' || a === 'downloading' || a === 'unavailable') return a
    return 'unavailable'
  } catch {
    return 'unavailable'
  }
}

/** Mirrors the SDK's request compatibility check for on-device inference. */
export function isOnDeviceCompatible(promptText: string, mimeTypes: string[]): boolean {
  if (!promptText.trim()) return false
  return mimeTypes.every((m) => ON_DEVICE_MIME_TYPES.includes(m))
}

/**
 * The privacy gate. Returns true only when the extract request will run on-device.
 * If false, the caller must have explicit cloud consent before calling the extract model.
 */
export async function willRunOnDevice(promptText: string, mimeTypes: string[]): Promise<boolean> {
  if (!isOnDeviceCompatible(promptText, mimeTypes)) return false
  return (await checkDeviceAvailability()) === 'available'
}
