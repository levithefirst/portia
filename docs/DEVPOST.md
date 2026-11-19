# Devpost submission text (for Fluid to paste)

Replace `<YOUTUBE_URL>` before submitting. Platform: **Web (Chrome)**.

---

**Title:** Portia

**Tagline:** See what a lease really costs before you sign.

**Links**
- App: https://askportia.vercel.app (judges: https://askportia.vercel.app/?judge=1)
- Code: https://github.com/levithefirst/portia (Apache-2.0)
- Video: <YOUTUBE_URL>

The sample lease advertises $1,850 a month. Once its required technology, amenity, valet trash and billing fees are added, it really costs **$1,961.95 a month**, and **$6,931.95 is due at signing** (deposit, the $250 and $95 move-in fees, and the first month with required fees). Portia finds that for any rental agreement: it turns the lease into a fee map, does the true-cost math, and flags the terms worth asking about before you sign. The lease is read on your device when Gemini Nano is available, and the cloud only ever sees the numbers you approve.

## Potential Impact

**Who it is for:** renters, and anyone about to sign a housing, storage or similar consumer agreement, especially people who cannot pay a lawyer to read it first.

**The problem:** people sign agreements full of fees and terms they never priced in.

- In a study of 70 Greater Boston residential leases, 51 (73%) contained at least one unenforceable clause (Furth-Matzkin, *Journal of Legal Analysis*, 2017).
- Only 24% of UK tenants read the tenancy agreement before signing, and 39% signed contracts they did not understand (Weightmans / The Negotiator, May 2024).
- 56% of US residents skimmed the lease, read only sections, or did not read it (AppFolio State of Resident Onboarding 2026, via Authority PM).
- Hidden rental fees are a live enforcement issue: the FTC's November 2026 order requires Progress Residential / Pretium to pay $49.75M over hidden rental fees, after Invitation Homes paid $48M in 2024.

A lease is also exactly the document people should not paste into a chatbot: names, addresses, signatures, bank details. Portia gives renters the money answer and a question list without asking them to give the lease away.

Playbooks: US-typical, England & Wales (Tenant Fees Act 2019 patterns), Lagos (Lagos State Tenancy Law 2011 patterns) and a general predatory-fee pack informed by public FTC junk-fee enforcement. It works on a phone too: a Pixel 7 has no on-device model, so Portia asks for consent and uses the cloud.

## Technological Implementation

- **Two Firebase AI Logic model instances, two inference modes** (`firebase@13.3.0`, `getAI(app, { backend: new GoogleAIBackend() })`):
  - **Extract:** `InferenceMode.PREFER_ON_DEVICE`, structured output on both sides from one `Schema.object` lease schema (`onDeviceParams.promptOptions.responseConstraint` and `inCloudParams.generationConfig.responseSchema`). `initializeDeviceModel()` runs on a click with a download progress bar.
  - **Check:** `InferenceMode.ONLY_IN_CLOUD` with a findings array schema. Its prompt is the approved JSON as text, never the lease or images.
- **No silent fallback.** Under PREFER_ON_DEVICE the SDK falls back to the cloud when Gemini Nano is not ready, which would ship the raw lease. Portia runs the same availability checks the SDK runs before every extract; if the request would not stay on-device, nothing is sent until the user consents for that document.
- **inferenceSource on screen:** every model call shows where it ran, straight from `result.response.inferenceSource`. Non-model steps get their own labels (sample data, cached sample, rules in this browser) and are never shown as on-device.
- **Privacy receipt after every run:** a table of each step (extract, rules, check), where it ran, how long it took, and what left the device, with the prompt size passed to Firebase AI Logic and the exact check text. It measures how much lease wording appears in what was sent, and only says "0 characters of lease text sent" when that is true. For the bundled sample it honestly reports that the approved summary fields contain 144 characters of lease wording (three short phrases) while the lease itself never left the device.
- **Offline verdict:** the red / amber / green counts come from playbook rules that run in the browser, so with no network Portia still gives the tiles, the true monthly cost and the questions, labelled "Offline: checked on this device", and offers "Run cloud review now" when you are back online.
- **PDF intake in the browser:** text PDFs are read with pdf.js (loaded only when needed); scanned PDFs become page images in the browser and go through the same on-device or consent gate. Parsing sends nothing.
- **App Check** with reCAPTCHA Enterprise (debug provider only in local development builds).
- **Remote Config** with safe defaults: cloud model (allowlisted), Judge Mode timeout (clamped), thin-extract retry, and a playbook version notice. It never blocks the first paint or the one-click run.
- **Accuracy eval:** 30 synthetic leases (20 dev, 10 holdout written blind before any prompt tuning), an in-app runner that uses the real engine, and a scorer for fee recall, exact dollar matches, true monthly cost, latency and on-device share. Results: not yet run. The public `/eval` page shows only committed results and says "No eval run recorded yet." until a real run is committed.
- **Tests:** unit tests for the gate, payloads, rules, receipt, scorer, config and service worker; a Playwright and axe smoke suite that runs without keys or Gemini Nano.

## Design

- One flow: add the lease (paste, PDF or photos), review the fee map with the true-cost math up front, approve, and get the clause map with a playbook citation and an "Ask the landlord" question on every flag.
- **Judge Mode** (`/?judge=1`): one click runs the bundled sample end to end and times it. If the live cloud check is unavailable for the sample, a clearly labelled cached sample result appears while it keeps retrying.
- The question list copies in one click, opens as an email draft with no recipient, or prints and saves as PDF. Copy, email and print all include the true monthly cost and the amount due at signing.
- While the cloud review runs, the counts are labelled "Preliminary" so a half-finished result never looks final.
- Light and dark themes, phone layout, an installable app shell, a social preview image, keyboard focus on the result, and screen reader announcements of the final counts.

## Quality of the Idea

Most privacy apps mask your document and send the rest. Portia never sends your lease. Gemini Nano turns it into a fee map on your device, you approve the numbers, and only that JSON is checked in the cloud. The verdict counts come from rules that run in your browser, so they still work offline.

The split follows the data: the sensitive document stays where the small model is; the cloud model only sees structured, user-approved facts and acts as a reviewer, not a reader. The output is money and questions, not a summary.

## Built during the hackathon

Built during the submission period (from Nov 14, 2026), with AI coding assistants: app, playbooks, fixtures, tests and docs.

## Not legal advice

Portia flags patterns from a curated static playbook with hedged notes and public sources. It does not know the law where you live and never says a term is illegal; flags are things worth asking about. Check with a tenant union, legal aid service or lawyer.

## Testing instructions

Open https://askportia.vercel.app/?judge=1 in Chrome. No login. Press the one button ("Run the sample lease", or on a browser without Gemini Nano "Send the sample to cloud Gemini and check", which is the consent). You get the clause map: 3 red, 6 amber, 0 green, true monthly cost $1,961.95, $6,931.95 due at signing, the privacy receipt, and a `Verdict in X.Xs` line with the time measured on your machine. If the live cloud check is unavailable for the sample lease you will see a clearly labelled cached sample result while it retries. For the manual path, open https://askportia.vercel.app/app?judge=0, load the sample (or a PDF, or paste your own lease), extract, edit a field, approve and check, then copy, email or print the questions. To test on-device, use desktop Chrome 139+ with the flags in the README and click **Prepare on-device model** first.
