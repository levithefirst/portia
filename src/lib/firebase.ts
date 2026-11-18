import { initializeApp, type FirebaseApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  type GenerativeModel,
} from 'firebase/ai'
import { checkSchema, leaseSchema } from './schema'
import { ON_DEVICE_CREATE_OPTIONS } from './onDevice'
import { DEFAULT_CLOUD_MODEL, getConfig, RC_DEFAULTS, RC_FETCH_RACE_MS, RC_KEYS, RC_MIN_FETCH_INTERVAL_MS, sanitizeConfig, setConfig } from './config'

/**
 * Default cloud model for Firebase AI Logic hybrid inference starting with
 * JS SDK v13.0.0 (configuration-options page). Set explicitly because the
 * official structured-output sample passes inCloudParams.model.
 */
export const CLOUD_MODEL = DEFAULT_CLOUD_MODEL

declare global {
  // Set to true in DEV builds only, before initializeAppCheck (App Check debug provider docs).
  var FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string | undefined
}

const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
}

const siteKey = env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY as string | undefined

/** Names of required env vars that are missing in this build. Values are never exposed. */
export function missingEnv(): string[] {
  const missing: string[] = []
  if (!firebaseConfig.apiKey) missing.push('VITE_FIREBASE_API_KEY')
  if (!firebaseConfig.projectId) missing.push('VITE_FIREBASE_PROJECT_ID')
  if (!firebaseConfig.appId) missing.push('VITE_FIREBASE_APP_ID')
  // Production builds must attest with reCAPTCHA Enterprise. DEV uses the debug provider.
  if (!import.meta.env.DEV && !siteKey) missing.push('VITE_RECAPTCHA_ENTERPRISE_SITE_KEY')
  return missing
}

export const isFirebaseConfigured = missingEnv().length === 0

export interface PortiaModels {
  extractModel: GenerativeModel
  checkModel: GenerativeModel
}

let models: PortiaModels | null = null
let app: FirebaseApp | null = null

/** Lazily initializes the Firebase app and App Check (once). */
export function getFirebaseApp(): FirebaseApp {
  if (app) return app
  if (!isFirebaseConfigured) {
    throw new Error(`Firebase is not configured. Missing: ${missingEnv().join(', ')}`)
  }

  app = initializeApp(firebaseConfig)

  if (import.meta.env.DEV) {
    // Debug provider for localhost only. Never reaches a production build:
    // Vite replaces import.meta.env.DEV with false and drops this branch.
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true
  }
  initializeAppCheck(app, {
    // In DEV the debug provider takes over; the placeholder key is never used for attestation.
    provider: new ReCaptchaEnterpriseProvider(siteKey || 'dev-debug-provider-in-use'),
    isTokenAutoRefreshEnabled: true,
  })
  return app
}

/**
 * Starts Remote Config in the background: fetchAndActivate raced against 1.5 s.
 * Never awaited by the UI; on any failure the defaults stay in place.
 */
export async function loadRemoteConfig(): Promise<void> {
  try {
    const rc = await import('firebase/remote-config')
    if (!(await rc.isSupported())) return
    const remoteConfig = rc.getRemoteConfig(getFirebaseApp())
    remoteConfig.settings.minimumFetchIntervalMillis = RC_MIN_FETCH_INTERVAL_MS
    remoteConfig.defaultConfig = RC_DEFAULTS
    await Promise.race([rc.fetchAndActivate(remoteConfig), new Promise((r) => setTimeout(r, RC_FETCH_RACE_MS))])
    const raw = Object.fromEntries(Object.values(RC_KEYS).map((k) => [k, rc.getValue(remoteConfig, k).asString()]))
    const remote = Object.values(RC_KEYS).some((k) => rc.getValue(remoteConfig, k).getSource() === 'remote')
    setConfig({ ...sanitizeConfig(raw), source: remote ? 'remote' : 'default' })
  } catch {
    /* Remote Config unreachable or invalid: keep the defaults */
  }
}

/** Lazily initializes Firebase, App Check and both model instances. No download is started here. */
export function getModels(): PortiaModels {
  if (models) return models
  const ai = getAI(getFirebaseApp(), { backend: new GoogleAIBackend() })
  // Cloud model from Remote Config if it has resolved by now, otherwise the default.
  const cloudModel = getConfig().cloudModel

  // 1) Extract: on-device first. Structured JSON on both sides per the hybrid docs.
  //    Portia never lets this model fall back to the cloud silently: see lib/gate.ts.
  const extractModel = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    inCloudParams: {
      model: cloudModel,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: leaseSchema,
      },
    },
    onDeviceParams: {
      createOptions: ON_DEVICE_CREATE_OPTIONS,
      promptOptions: { responseConstraint: leaseSchema },
    },
  })

  // 2) Check: cloud only. Receives the approved JSON as text, never the raw lease.
  const checkModel = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: cloudModel,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: checkSchema,
      },
    },
  })

  models = { extractModel, checkModel }
  return models
}
