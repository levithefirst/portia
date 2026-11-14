import { getModels } from './firebase'
import { checkDeviceAvailability, willRunOnDevice } from './onDevice'
import { toSourceLabel, type AiEngine } from './engine'

/** Firebase AI Logic engine. Every model call in Portia goes through here. */
export const firebaseEngine: AiEngine = {
  kind: 'firebase',
  availability: checkDeviceAvailability,

  async prepareDevice(onProgress) {
    const { extractModel } = getModels()
    // Official pattern: called on a user gesture, before any generateContent call.
    await extractModel.initializeDeviceModel((val) => onProgress(val))
  },

  willRunOnDevice,

  async extract(prompt, images) {
    const { extractModel } = getModels()
    const result =
      images.length > 0
        ? await extractModel.generateContent([prompt, ...images])
        : await extractModel.generateContent(prompt)
    return { text: result.response.text(), source: toSourceLabel(result.response.inferenceSource) }
  },

  async check(prompt) {
    const { checkModel } = getModels()
    // The prompt string contains the approved JSON as text. No images, no lease text.
    const result = await checkModel.generateContent(prompt)
    return { text: result.response.text(), source: toSourceLabel(result.response.inferenceSource) }
  },
}
