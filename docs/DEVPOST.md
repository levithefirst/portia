# Devpost submission text (for Fluid to paste)

Replace `<APP_URL>` and `<YOUTUBE_URL>` before submitting. Platform: **Web (Chrome)**.

---

**Title:** Portia

**Tagline:** See what a lease really costs before you sign. Gemini Nano maps the fees on your device; only the facts you approve go to the cloud.

**Links**
- App: <APP_URL>
- Code: https://github.com/levithefirst/portia (Apache-2.0)
- Video: <YOUTUBE_URL>

## The problem

Renters sign agreements full of fees and terms they never see coming. In a study of 70 Greater Boston leases, 51 (73%) contained at least one unenforceable clause (Furth-Matzkin, Journal of Legal Analysis, 2017). Only 24% of UK tenants read the tenancy agreement before signing, and 39% signed contracts they did not understand (Weightmans / The Negotiator, May 2024). 56% of US residents skimmed the lease, read only sections, or did not read it (AppFolio State of Resident Onboarding 2026). Hidden rental fees are a live enforcement issue: in November 2026 the FTC ordered Progress Residential / Pretium to pay $49.75M, after Invitation Homes paid $48M in 2024.

A lease is also exactly the kind of document people should not paste into a chatbot: names, addresses, signatures, bank details.

## What Portia does

1. **Paste the lease or add JPEG/PNG page photos.** No account.
2. **Extract on-device.** Gemini Nano builds a structured fee-and-obligation map: rent, deposit, late fee and grace days, every mandatory fee, notice period, auto-renewal, repairs, early termination, guests, other money terms.
3. **Review and approve.** Every field is editable. Empty fields are highlighted; you can mark any field "I'm not sure". Portia shows the true monthly cost and the exact JSON that will be sent.
4. **Check in the cloud on the approved JSON only.** Cloud Gemini scores it red / amber / green against a curated, jurisdiction-tagged playbook (US-typical, England & Wales, Lagos, General predatory-fee pack). The same rules also run deterministically in the browser, so results do not depend only on model prose, and any red that cites no playbook rule is capped at amber.
5. **Act.** Each finding has a playbook citation and an "Ask the landlord" question. The question list prints or saves as PDF.

It is not a "simplify this lease" wrapper and not legal advice: the output is a structured map plus hedged, cited flags.

## How we used Firebase AI Logic hybrid inference

- `firebase@13.3.0`, `getAI(app, { backend: new GoogleAIBackend() })`, App Check with `ReCaptchaEnterpriseProvider` (debug provider in DEV only).
- **Extract model:** `InferenceMode.PREFER_ON_DEVICE`, structured output on both sides: `onDeviceParams.promptOptions.responseConstraint` and `inCloudParams.generationConfig.responseSchema` share one `Schema.object` lease schema. `initializeDeviceModel()` runs on a button click with a visible download progress bar. Text-only calls use `generateContent(prompt)`; photos use `generateContent([prompt, ...imageParts])` with the official FileReader inlineData helper, up to 3 pages per turn with batch merging beyond that.
- **Check model:** `InferenceMode.ONLY_IN_CLOUD` with `gemini-3.5-flash-lite` and a findings array schema. Its prompt contains the approved JSON as text, never the lease or images.
- **inferenceSource on screen:** every call shows a badge (`Extract: ON_DEVICE`, `Extract: IN_CLOUD`, `Check: IN_CLOUD`) from `result.response.inferenceSource`.
- **No silent fallback.** Under PREFER_ON_DEVICE the SDK falls back to the cloud when Nano is not ready, which would ship the raw lease. Portia mirrors the SDK's own availability checks before every extract and, if the request would not run on-device, shows a consent banner. Nothing is sent until the user clicks "Send to cloud Gemini". On a Pixel 7 (no Prompt API) the app is still complete through that consent path.

## On-device vs cloud

| | On-device (Gemini Nano, Chrome 139+ desktop) | Cloud (Gemini via Firebase AI Logic) |
| --- | --- | --- |
| Extract fee map from text/photos | Yes, default | Only after explicit consent |
| Review and edit | In the browser | |
| Playbook rules | In the browser | |
| Red/amber/green check | | Yes, approved JSON only |

## Built during the hackathon

Everything in the repo was built during the submission period (from Nov 14, 2026): app, playbooks, fixtures, tests and docs.

## Not legal advice

Portia flags patterns from a curated static playbook with hedged notes and public sources. It does not know the law where you live and never says a term is illegal. Check with a tenant union, legal aid service or lawyer.

## Testing instructions

Open <APP_URL>/?judge=1 in Chrome (Judge Mode: models pre-warmed on landing, the core loop is timed on the result card, and if the live cloud check is unavailable for the sample lease you will see a clearly labelled cached sample result while it retries). No login. Click **Load sample lease**, then **Extract fee map**. On a browser without Gemini Nano, accept the consent banner. Edit a field, click **Approve & check**, review the clause map and print the questions. To test on-device, use desktop Chrome 139+ with the flags in the README and click **Prepare on-device model** first.
