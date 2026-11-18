# Portia

**See what a lease really costs before you sign.** Portia maps every fee and obligation in a rental agreement on your device with Gemini Nano, lets you correct the map, then sends only the JSON you approve to cloud Gemini, which scores it red / amber / green against a curated, jurisdiction-tagged playbook.

Built for #BuildHybridAI 2026 with **Firebase AI Logic hybrid inference** (Web / Chrome). Not legal advice.

- App: https://askportia.vercel.app (tool: https://askportia.vercel.app/app, judges: https://askportia.vercel.app/?judge=1)
- License: Apache-2.0

## Why

- In a study of 70 Greater Boston residential leases, 51 (73%) contained at least one unenforceable clause (Furth-Matzkin, *Journal of Legal Analysis*, 2017).
- Only 24% of UK tenants read the tenancy agreement before signing, and 39% signed contracts they did not understand (Weightmans / The Negotiator, May 2024).
- 56% of US residents skimmed the lease, read only sections, or did not read it (AppFolio State of Resident Onboarding 2026, via Authority PM).
- The FTC's November 2026 order requires Progress Residential / Pretium to pay $49.75M over hidden rental fees, after Invitation Homes paid $48M in 2024.

Portia is not a "summarize this lease" wrapper. The output is a structured fee-and-obligation map, a true monthly cost, and flags with a playbook citation and a question to send the landlord.

## How the hybrid split works

```
 Lease text / PDF / JPEG+PNG page photos
            │  PDF parsed in the browser by pdf.js (text, or scanned pages -> PNG). Nothing sent.
            ▼
 ┌────────────────────────────────┐   privacy gate: will this run on-device?
 │ Extract model                  │── no ──► consent banner. Nothing is sent
 │ InferenceMode.PREFER_ON_DEVICE │          until "Send to cloud Gemini"
 │ Gemini Nano (Chrome Prompt API)│          (offline + no Nano: clear message, no banner)
 │ responseConstraint = leaseSchema│
 └────────────────────────────────┘
            │  JSON fee map + badge from inferenceSource (on_device, or in_cloud with consent)
            ▼
   User edits fields, marks "I'm not sure", sees the exact payload
            │  approved JSON only (no text, no images)
            ▼
 ┌────────────────────────────────┐   playbook rules run in the browser on the same JSON:
 │ Check model                    │   they set the red / amber / green counts.
 │ InferenceMode.ONLY_IN_CLOUD    │   Offline or network error -> rules-only verdict,
 │ cloud_model (Remote Config,    │   "Offline: checked on this device"
 │ default gemini-3.5-flash-lite) │
 └────────────────────────────────┘
            ▼
 Clause map, citations, "Ask the landlord" (copy, email, print),
 privacy receipt: each step, where it ran, what left the device
```

| Step | Where it runs | What it sees |
| --- | --- | --- |
| Extract | On-device (Gemini Nano) when ready. Cloud only after explicit consent. | Lease text and/or up to 3 page images per turn |
| Review | Your browser | The JSON map |
| Playbook rules | Your browser | The approved JSON |
| Check | Cloud Gemini via Firebase AI Logic | Instructions, public playbook rules, approved JSON, "not sure" field list |

Key files:
- `src/lib/firebase.ts`: `initializeApp`, App Check (`ReCaptchaEnterpriseProvider`; debug token in DEV only), `getAI(..., { backend: new GoogleAIBackend() })`, both `getGenerativeModel` instances.
- `src/lib/schema.ts`: `leaseSchema` and `checkSchema` with `Schema.object` / `Schema.array({ items })` / `optionalProperties`.
- `src/lib/onDevice.ts` + `src/lib/pipeline.ts`: the privacy gate (mirrors the SDK's own on-device checks) and parsing.
- `src/lib/engine.firebase.ts`: every `generateContent` and `initializeDeviceModel` call.
- `src/playbooks/*.json` + `src/lib/rules.ts`: static playbooks (US-typical, England & Wales, Lagos, General predatory-fee pack) and the rule engine.

### Why the consent gate exists

Under `PREFER_ON_DEVICE`, the SDK sends a request to the cloud whenever the on-device model is not ready (still downloading, not supported, or the browser has no Prompt API, as on Android Chrome or a Pixel 7). For a lease, that would silently ship the raw document while the UI implies privacy. Portia checks the same conditions the SDK checks (`LanguageModel` exists, `LanguageModel.availability()` is `"available"` with the same `createOptions`, images are JPEG/PNG) before every extract, and requires a click on "Send to cloud Gemini" otherwise. Consent is per document. Details in `docs/SDK-NOTES.md`.

## Privacy receipt

Every run ends with a receipt under the tiles (`src/lib/receipt.ts`, `src/components/Receipt.tsx`): one row per step (extract, playbook rules, cloud review) with where it ran, the time, and what left the device. "Ran on" for a model step comes only from the SDK's `inferenceSource`; rules, cached and sample steps have their own labels. Sizes are the prompt size passed to Firebase AI Logic (UTF-8 bytes), not bytes on the wire. The check row holds the exact text sent to the check model. "Copy receipt (JSON)" copies it; printing includes a one-line summary.

The headline is measured, not assumed. `leaseTextSent()` slides 40-character windows over the whitespace-normalised lease text and counts lease characters that appear verbatim in what was sent. It reads "0 characters of lease text sent" only when the extract stayed on the device (or used sample data) and that count is 0. For the bundled sample it is not 0: the recorded extract's summary fields (repairs, early termination, attorney fees) copy three short lease phrases, 144 characters in all, so the receipt says the lease never left the device and lists those phrases. After a consented cloud extract it states what was sent, in the form "Lease text sent to cloud Gemini with your consent: N characters, N images."

## Offline verdict

The counts come from playbook rules that run in the browser, so Portia still gives a verdict with no network (`src/lib/network.ts`). If the device is offline, or the cloud check fails with a network error, the results are finalised from the rules: tiles, true monthly cost, due at signing and the questions, with the badge "Offline: checked on this device" (label `RULES_ONLY`, never `ON_DEVICE`) and a "Run cloud review now" button that is enabled only when you are back online. Nothing is sent automatically on reconnect. Offline without Gemini Nano, Portia cannot read a new lease and says so instead of offering cloud consent. The bundled sample still works offline. The production build also registers a small service worker (`public/sw.js`) that caches the app shell and never touches Firebase, Google APIs, gstatic or reCAPTCHA requests.

## PDF intake

PDFs (up to 15 MB and 30 pages) are parsed in the browser with `pdfjs-dist`, loaded only when the first PDF is added (`src/lib/pdf.ts`). A PDF with real text fills the lease text box, with `--- page N ---` markers. A scanned PDF is rendered page by page to PNG and queued as page images, so it goes through the same on-device or consent gate and the batch flow as photos. Parsing is not AI inference and sends nothing anywhere.

## Remote Config

`src/lib/config.ts` reads Firebase Remote Config in the background on the tool routes (`fetchAndActivate` raced against 1.5 s, minimum fetch interval 1 hour). It never blocks the first paint, Judge Mode warm-up or the one click; model instances created before it resolves use the defaults for that session. Invalid or missing values fall back to the defaults. The receipt footer shows the active values and whether they came from `remote` or `default`.

| Key | Type | Default | Rule |
| --- | --- | --- | --- |
| `cloud_model` | string | `gemini-3.5-flash-lite` | Allowlist: `gemini-3.5-flash-lite`, `gemini-3.8-flash`; anything else uses the default |
| `judge_timeout_ms` | number | `8000` | Clamped to 3000..20000 |
| `extract_thin_retry` | boolean | `true` | Retry a thin Judge Mode sample extract once |
| `playbook_min_version` | string | `""` | `YYYY-MM`; if a bundled playbook is older, shows "A newer playbook is published. Reload to update." |

## Accuracy eval (`/eval`)

30 SYNTHETIC leases with ground truth in `eval/fixtures/` (20 dev, 10 holdout written blind in their own commit before any prompt tuning). Run them through the real engine at `/eval?run=1` in a normal Chrome window, download the results JSON, then `npm run eval:score -- results.json` prints fee recall, exact dollar matches (rent, deposit, late fee, total monthly fees), true monthly cost exact match, median and p90 extract latency and the ON_DEVICE vs IN_CLOUD share, split dev vs holdout, and writes `eval/results/summary-<date>-<ranOn>.json`. The `/eval` page shows only committed summaries. **No eval run has been recorded yet.** See `eval/README.md`.

## Judge Mode (`?judge=1`)

A reliability mode for evaluators, enabled per browser session with `?judge=1` (`?judge=0` turns it off). A one-line bar says when it is on.

- **One click:** a single primary button, "Run the sample lease", loads the bundled sample, extracts it, auto-approves only if the extract is full, runs the cloud check and lands on the clause map. On a browser without Gemini Nano the button reads "Send the sample to cloud Gemini and check" and the click is the consent.
- **Pre-warm on landing:** without waiting for a tap and without blocking the page, Portia checks Nano availability and initialises Firebase, App Check and both AI Logic model instances. `initializeDeviceModel()` runs during pre-warm only if Nano is already downloaded.
- **Stable sample results:** for the unmodified bundled sample only, a thin live extract is retried once, and the review is pinned to the canonical values in `src/fixtures/sample-extract.json` with a visible label (or a labelled fallback if the live extract stays thin). The tiles count the deterministic in-browser playbook rules, so every run shows 3 red / 6 amber / 0 green; the cloud review appears as commentary on each card.
- **Timing:** while the cloud review runs, the tiles are labelled "Preliminary: playbook rules in your browser" with a live timer. When it finishes, the card shows e.g. `Verdict in 4.2s, cloud + cloud (extract 1.2s + check 3.0s), one click`.
- **Cached sample verdict:** for the unmodified bundled sample only, if the live check errors, is rate limited or takes more than 8 seconds, Portia shows the recorded verdict labelled **"Cached sample result (live check unavailable)"**, keeps retrying live in the background and swaps in the live result if it arrives. The recorded verdict (`src/fixtures/sample-verdict.json`) came from a live `in_cloud` run on 2026-11-14.
- **Never on your documents:** pasted leases, photos, or an edited sample get the normal flow, errors and retries. No fixture values are ever substituted for them.

Everywhere (not only Judge Mode): **Approve & check** is disabled when an extract is below the fullness bar (rent plus at least 5 of 8 core money fields) with the message "This extract is missing too many fields to check. Fill them in, or go back and extract again." Editing fields by hand unlocks it.

## Run on-device in Chrome

1. Chrome on desktop, version **139 or higher** (`chrome://settings/help`).
2. Set `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` to **Enabled** (official get-started guide).
3. The hackathon FAQ also says: "In chrome://flags, search for "Gemma 4 for Built-in AI" and enable it."
4. Restart Chrome, open Portia, click **Prepare on-device model** and wait for the download (several minutes; progress is shown).
5. Load sample lease > **Extract fee map**. The badge reads `Extract: ON_DEVICE`.

Phones (including Pixel 7 / Android Chrome) cannot run the Prompt API. Portia still works there: Extract shows the consent banner, and after consent the badge reads `Extract: IN_CLOUD`.

## Local development

```bash
npm ci
cp .env.example .env   # fill in values locally; .env is gitignored
npm run dev
```

In `npm run dev`, App Check uses the debug provider (`self.FIREBASE_APPCHECK_DEBUG_TOKEN = true`, DEV only). Copy the token printed in the browser console and register it in the Firebase console (Security > App Check > Apps > overflow menu > Manage debug tokens). Never commit it.

Without any env vars the app still builds and runs: it shows an "AI is not configured" setup state and lets you explore the full flow with a pre-recorded sample extract (badge `SAMPLE DATA`) and the in-browser playbook rules.

## Deploy (Vercel)

Import the GitHub repo in Vercel with the **Vite** preset. `vercel.json` sets the build, output directory and SPA rewrites (every path serves `index.html`). Set these in **Project > Settings > Environment Variables** (never in git):

`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`

App Check: Firebase AI Logic requires App Check. Production uses reCAPTCHA Enterprise; add the Vercel domain to the reCAPTCHA key. See https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider and `docs/HANDOFF-PORTIA.md`.

## Privacy

Portia has no server, no account and no database. When Gemini Nano is ready, the lease is processed on your device and never leaves it. If it is not ready, nothing is sent until you accept a banner that says your text and photos will go to Google's cloud Gemini through Firebase AI Logic. The check step sends only the JSON you approved, never the lease text or photos. "Remember my last approved extract" is off by default and stores only that JSON in localStorage. PDFs are parsed in the browser by pdf.js and nothing is uploaded while parsing. Full description: the in-app Privacy page (`/privacy`).

### Verify the check payload yourself (DevTools)

1. Open DevTools > **Network**, filter by `generateContent`.
2. Click **Approve & check**. Select the request to `firebasevertexai.googleapis.com` (Firebase AI Logic proxy).
3. In **Payload**, the request body has a single text part: instructions, the playbook rules, and your approved JSON. Search it for a phrase from the lease (for example `RESIDENTIAL LEASE`): it is not there, and there is no `inlineData` part.
4. The same text is shown in the app under "View the exact text sent to the check model".

## Tests

```bash
npm test              # unit tests (vitest): gate, payloads, parsing, rules, receipt, share text, scorer, config, service worker
npm run test:smoke    # builds twice and drives Chromium with Playwright + axe-core
```

The smoke test needs no keys and no Nano. Part A uses the production build without env vars (setup state, sample extract, rules, PDF rejection, print list, privacy route, dark mode, axe). Part B uses a `--mode e2e` build with a fake engine that behaves like a phone without Nano: it asserts no model call happens before consent, the badges, and that the check request carries the edited JSON and no lease text or images. Part C is the Judge Mode suite: from `/?judge=1`, one click reaches a full-evidence verdict in under 10 s with the cloud check mocked OK, failing (429) and slow; five runs with drifting live extracts give identical counts; a thin sample extract is retried then shown as a labelled fallback; Approve is disabled on a thin extract; no Extract button is clickable under the consent banner; and the 412 px results fold and 1280x800 review fold are checked. Later parts cover the offline verdict (D), the privacy receipt (E), PDF intake with no AI-host requests (F), the thin-extract guard and preliminary state (G), the no-Nano copy audit (H), copy and email (I), the eval page (J), Remote Config defaults (K), the PWA files and meta tags (L) and the accessibility pass (M). The fake engine (`?fakeCheck=fail|slow|offline`, `?fakeExtract=thin|thinonce|wild`, `?fakeDevice=available`) is compiled in only for `--mode e2e`.

`scripts/verify.sh` runs typecheck, unit tests, build and smoke in order.

To exercise the real cloud path locally, put real values in `.env`, run `npm run dev`, register the debug token, and use the app.

## Milestone acceptance

**M0** SDK notes pin `firebase@13.3.0` and quote the live flag and default model (`docs/SDK-NOTES.md`); handoff checklist exists; no invented flags, keys or SDK names.
**M1** `npm ci` works; tokens in `src/styles.css` (Tailwind default palette removed); Apache-2.0 `LICENSE`; `vercel.json` rewrites; `.env` gitignored, `.env.example` blank; repo private.
**M2** Build succeeds without secrets; Load Sample > Extract > edit > Approve & check implemented; badges on extract and check; consent banner before any cloud extract; PDF rejected (since Addendum 4, PDFs are parsed in the browser instead); "Not legal advice" visible; check payload is approved JSON only.
**M3** Multi-page photos (up to 3 per turn, batch merge beyond); unclear fields flagged and still approvable; playbook citation per finding; printable question list; recoverable errors with retry; smoke test runnable; privacy copy matches code.
**M4** Finished UI (light/dark/phone); remember toggle off by default, JSON only; demo script, Devpost text, submission checklist, refreshed handoff.
**M5** See the final report in `docs/SUBMISSION-CHECKLIST.md`.

## Not legal advice

Playbooks are curated static checklists with hedged notes and sources, not a statute database. Portia never says a term is illegal where you live. Check with a tenant union, legal aid service or lawyer.
