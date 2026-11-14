# SDK notes (verified 2026-11-14)

All facts below were re-read from the live official pages on 2026-11-14 (pages show "Last updated 2026-11-12 UTC") and from the installed `firebase@13.3.0` typings and source.

## Pinned version

| Item | Value | Source |
| --- | --- | --- |
| `firebase` npm package | **13.3.0** (exact pin in `package.json`) | `npm view firebase version` on 2026-11-14 (published 2026-11-11) |
| Minimum for on-device inference | v12.5.0 | get-started: "supported for web apps using Firebase AI Logic SDK v12.5.0+" |
| Minimum for `inferenceSource` | v12.5.0 | configuration-options: "available starting with JS SDK v12.5.0" |
| Default cloud model | **`gemini-3.5-flash-lite`** | configuration-options: "The default cloud-hosted model is `gemini-3.5-flash-lite` (starting with JS SDK v13.0.0)". Also `DEFAULT_HYBRID_IN_CLOUD_MODEL = 'gemini-3.5-flash-lite'` in `@firebase/ai` 13.3.0 source. |

Portia sets `inCloudParams.model: "gemini-3.5-flash-lite"` explicitly (constant `CLOUD_MODEL` in `src/lib/firebase.ts`) because the official structured-output sample passes `inCloudParams.model`, and the SDK throws `NO_MODEL` if `inCloudParams` is given without `model`.

## Chrome on-device setup

- Browser: "Chrome on Desktop (version 139 or higher)" (get-started).
- Official flag, quoted from https://firebase.google.com/docs/ai-logic/hybrid/web/get-started (Step 1):
  > Enable the on-device multimodal model by setting the following flag to **Enabled**:
  > `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`
- Additional flag from the hackathon FAQ, quoted from https://firebasehybridaihackathon.devpost.com/details/faqs ("How do I enable Gemini Nano 4 in Chrome?"):
  > It's available through the Chrome Prompt API. In chrome://flags, search for "Gemma 4 for Built-in AI" and enable it.

  The FAQ gives a search string, not a `chrome://flags/#...` anchor. Portia's README quotes it exactly and does not invent an anchor.
- Optional model pre-download (get-started Step 1): `await LanguageModel.availability();` then `await LanguageModel.create();`.

## App Check provider (live)

- Class: **`ReCaptchaEnterpriseProvider`**, imported from `firebase/app-check` (https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider):
  ```js
  import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_KEY), isTokenAutoRefreshEnabled: true });
  ```
- Key: score-based **Web** key created in Google Cloud console > **Fraud Defense** page (the docs now label the reCAPTCHA page "Fraud Defense"). Leave "Use checkbox challenge" unselected. Never add `localhost` to a production key.
- Registration: Firebase console > **Security** > **App Check** > **Apps** tab.
- Debug provider (get-started Step 4): `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;` before `initializeAppCheck`. Register the token printed in the console under **Security > App Check > Apps tab > overflow menu > Manage debug tokens**.
- Banner on every AI Logic page: "Starting November 2, 2026, Firebase App Check enforcement will be required to use Firebase AI Logic."
- Hackathon rules: "Firebase AI Logic requires App Check; debug tokens are accepted in submissions."

## Hybrid API shapes used (all match docs and typings)

- `getAI(firebaseApp, { backend: new GoogleAIBackend() })`
- `getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE, inCloudParams: { model, generationConfig: { responseMimeType: "application/json", responseSchema } }, onDeviceParams: { createOptions, promptOptions: { responseConstraint: schema } } })`
- `getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: { ... } })`
- `model.initializeDeviceModel((val) => ...)` with `val` in 0..1. Typings: `initializeDeviceModel(onDownloadProgress?: (progressValue: number) => void): Promise<void>`.
- `model.generateContent(prompt)` and `model.generateContent([prompt, imagePart])`.
- `result.response.text()`, `result.response.inferenceSource`.
- `Schema.object({ properties, optionalProperties })`, `Schema.array({ items })`, `Schema.string()`, `Schema.number()`, `Schema.enumString({ enum })`.
- Image part: official FileReader helper returning `{ type: "inlineData", inlineData: { data, mimeType } }` (`src/lib/intake.ts`).

## Discrepancies and decisions

1. **`inferenceSource` values are lowercase.** Docs say the value is "either `ON_DEVICE` or `IN_CLOUD`". Typings in 13.3.0: `InferenceSource = { ON_DEVICE: "on_device", IN_CLOUD: "in_cloud" }`. Portia maps the raw value to the uppercase label shown on the badge (`toSourceLabel` in `src/lib/engine.ts`).
2. **`Schema.boolean` exists** in 13.3.0 typings. Portia still stores `autoRenewal` as `Schema.enumString({ enum: ["yes","no","unclear"] })` so the model can answer "unclear" instead of guessing true/false. `Schema.enumString` is shown on the official hybrid structured-output page.
3. **Check schema** is a top-level `Schema.array({ items: Schema.object(...) })`. The parser also accepts `{ findings: [...] }` defensively.
4. **Silent fallback.** Typings for `initializeDeviceModel`: "Calling inference methods before the device is ready will result in a cloud fallback if `inferenceMode` is set to `PREFER_ON_DEVICE`". In 13.3.0 source (`ChromeAdapterImpl.isAvailable`), a PREFER_ON_DEVICE request runs on-device only if the `LanguageModel` global exists, `LanguageModel.availability(createOptions) === "available"`, the request is non-empty, and every inline image is `image/jpeg` or `image/png`. If the `LanguageModel` global does not exist (Android Chrome, Safari, older Chrome), no adapter is created and every call goes to the cloud. Portia evaluates the same conditions in `src/lib/onDevice.ts` with the same `createOptions` it passes to the SDK, and `runExtract` (`src/lib/pipeline.ts`) throws `ConsentRequiredError` instead of calling the model when they fail and the user has not consented. If an on-device call itself errors, 13.3.0 does not retry in the cloud under PREFER_ON_DEVICE (the error is surfaced).
5. **On-device token limit.** The 9,216-token figure comes from the build brief; it is not stated on the Firebase pages above. Portia uses it only for a warning (`ON_DEVICE_TOKEN_BUDGET` in `src/lib/prompts.ts`) and caps each extract at 3 page images, with "Add another batch" for more. Per-image token cost is not documented by Firebase; Portia's estimate uses a conservative placeholder.
6. **Confidence.** No confidence API is used. Empty fields and fields the user marks "I'm not sure" are highlighted amber and passed to the check prompt as a list.
7. **Single package.** App Check is imported from `firebase/app-check` on the single `firebase` package. No `@firebase/app-check` dependency.
8. **Count tokens** is listed as not supported for hybrid; Portia does not call it.
