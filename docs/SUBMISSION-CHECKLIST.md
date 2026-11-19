# Submission checklist: #BuildHybridAI 2026

Deadline: **Mon 30 Nov 2026, 11:00 PM WAT** (Devpost: 5:00 PM EST; FAQ: 2:00 PM PT). Track: **Best Web/Chrome App**, also eligible for Grand Prize and Runner-Up. Sources: https://firebasehybridaihackathon.devpost.com/ and /details/faqs (read 2026-11-14).

Legend: **Repo** = done in code/docs. **Handoff #n** = Portia bot step in `docs/HANDOFF-PORTIA.md`. **Fluid** = Fluid does it.

## Devpost requirements

| Requirement | Where it is met | Status |
| --- | --- | --- |
| Gen AI app built with Firebase AI Logic | `src/lib/firebase.ts`, `src/lib/engine.firebase.ts` | Repo |
| Firebase AI Logic imported **and actually called** at runtime | `getAI`, `getGenerativeModel`, `initializeDeviceModel`, `generateContent` in `src/lib/engine.firebase.ts` | Repo |
| All inference through Firebase AI Logic; no other model APIs | Only `firebase/ai` is used; no other model SDKs in `package.json` | Repo |
| Both on-device and cloud inference | Extract `PREFER_ON_DEVICE`, check `ONLY_IN_CLOUD`, badges | Repo |
| Platform: Web (Chrome) | Chrome 139+ desktop for Nano; any browser via consent path | Repo; select **Web (Chrome)** on Devpost (Fluid) |
| App Check (required; debug tokens accepted) | `ReCaptchaEnterpriseProvider` in prod, debug token in DEV only | Repo + Handoff #4, #5, #6 |
| Public GitHub repo | Private now. Flip to public **only after Fluid's OK**, before submit | Handoff #8 |
| Open source license visible in About | `LICENSE` (Apache-2.0), `"license": "Apache-2.0"` in package.json | Repo + verify in Handoff #8 |
| Repo has all source, assets, run instructions, value proposition | `README.md`, fixtures in `public/`, playbooks in `src/playbooks/` | Repo |
| Text description: Firebase AI Logic usage, features, value proposition | `docs/DEVPOST.md` | Repo; paste (Fluid) |
| Demo video, 3 min max, English, public on YouTube, shows the platform | `docs/DEMO-SCRIPT.md` | Fluid (Handoff #9) |
| First 30 seconds: who, problem, how Firebase AI Logic makes it work | `docs/DEMO-SCRIPT.md` 0:00 to 0:30 | Repo script; Fluid records |
| Functionality matches the video | Script only uses shipped features; no faked badges | Fluid |
| Hosted URL (strongly encouraged) | https://askportia.vercel.app, judges link `/?judge=1` | Done |
| Free to evaluate, no login | No account; Gemini Developer API free tier | Repo |
| All materials in English | UI and docs in English | Repo |
| No secrets, keys, debug tokens or PII in repo/form | `.gitignore`, `.env.example` blank, secret grep clean (below) | Repo |
| Existing-app disclosure | New project; stated in `docs/DEVPOST.md` | Repo |
| Submit before deadline; commits after deadline not evaluated | | Fluid (Handoff #9) |

## Judging criteria (equal weight)

| Criterion | Evidence in Portia |
| --- | --- |
| **1. Technological Implementation**: how well built, how effectively it uses Firebase AI Logic hybrid inference | Two model instances with different inference modes per feature (the FAQ's recommended pattern). Structured output on both sides via one `Schema` (`responseConstraint` + `responseSchema`). `initializeDeviceModel` on a gesture with progress. Privacy gate that mirrors the SDK's on-device checks to block silent fallback (`src/lib/onDevice.ts`, `src/lib/pipeline.ts`). `inferenceSource` badges. App Check. Deterministic in-browser rule engine plus cloud review merge; uncited reds capped. 27 unit tests and a 63-check Playwright + axe smoke test, including a Judge Mode 10-second loop with the cloud mocked to fail. Judge Mode pre-warms the models and times the loop. |
| **2. Design**: complete, coherent product, not a proof of concept | Three-step flow (Document > Review > Clause map), editable extract, true monthly cost, printable question list, light/dark/phone layouts, ink-on-paper theme with semantic status colors plus icons and text labels, empty/loading/error/retry/download states, Privacy page, setup state that still works without keys. |
| **3. Potential Impact**: credible, specific case for a real audience, demonstrated | Renters before signing. Verified stats (Furth-Matzkin 2017; Weightmans 2024; AppFolio 2026) and FTC enforcement ($49.75M Progress Residential, $48M Invitation Homes). Playbooks for the US, England & Wales, Lagos, and a general junk-fee pack. Works on a Pixel 7 via consent. |
| **4. Quality of the Idea**: creative, non-obvious use of Firebase AI Logic; understanding of the problem | Hybrid split by data sensitivity: the private document stays on-device; only a user-approved, minimal JSON reaches the cloud. Output is a structured fee map with citations and landlord questions, not a summary. Honest about the fallback trap in PREFER_ON_DEVICE and designs around it. |

## Self-verification (Milestone 5 + Addenda 2 and 3), run 2026-11-15

| Check | Result |
| --- | --- |
| `npm ci && npm run build` | PASS |
| `npm test` (vitest, 27 tests) | PASS |
| `npm run test:smoke` (63 checks incl. axe; Judge Mode one click to full verdict under 10 s with cloud OK and failing; identical counts over 5 runs; Approve blocked on thin extract; no Extract button under consent; 412 px and 1280x800 folds) | PASS |
| Judge Mode: cached result only for the unmodified sample, labelled "Cached sample result (live check unavailable)", live retry + swap, elapsed time, pre-warm | PASS (unit + smoke) |
| No API keys, debug tokens or secrets in git (`git grep` for `AIza`, `6L`-style site keys, private keys, tokens) | PASS |
| Repo still private; Claude Code did not change visibility | PASS (flip is Handoff #8 after Fluid's OK) |
| Apache-2.0 `LICENSE` in repo | PASS (About visibility: Handoff #8) |
| `vercel.json` SPA rewrites | PASS |
| Theme tokens only; Tailwind default palette removed; brand `#247D97` | PASS |
| Consent banner; no silent raw-document cloud fallback | PASS (unit + smoke) |
| Check step sends approved JSON only | PASS (unit + smoke) |
| `inferenceSource` badges on extract and check | PASS |
| PDF rejected; Not legal advice visible; fixtures (text + JPEG + PNG) with junk fees, steep late fee, auto-renewal | PASS |
| Docs: SDK-NOTES, HANDOFF-PORTIA, DEMO-SCRIPT, DEVPOST, SUBMISSION-CHECKLIST, README, Privacy page | PASS |
| No Devpost submission, no video published, no secrets printed | PASS |
| Public HTTPS URL | PASS: https://askportia.vercel.app (Judge Mode: `/?judge=1`) |
| Recorded cloud verdict in `src/fixtures/sample-verdict.json` | PASS: recorded 2026-11-14 from a live `in_cloud` run (its notice-period misread is not shown; see HANDOFF 7b) |
| Public repo flip + license in About | **BLOCKED** on Fluid's OK (Handoff #8) |
| Video + Devpost submission | **BLOCKED**: Fluid only (Handoff #9) |
| ON_DEVICE capture on Nano-enabled desktop Chrome | **BLOCKED**: Fluid, for the video (Handoff #9.1) |

## Addendum 3 (win fixes) status

| # | Fix | Where | Status |
| --- | --- | --- | --- |
| 1 | Thin sample extract retried once, then labelled bundled fallback; never a 0-finding map | `src/App.tsx` (`doExtract`), `src/lib/judge.ts` (`isThinExtract`) | PASS |
| 2 | One-click "Run the sample lease" (consent button when no Nano) | `src/components/Intake.tsx`, `src/App.tsx` (`runSampleOneClick`) | PASS |
| 3 | Approve blocked below the fullness bar unless hand-edited | `src/components/ExtractEditor.tsx` | PASS |
| 4 | Hero tells the truth when Nano is missing | `src/components/DeviceStatus.tsx` (`heroLine`), `src/App.tsx` | PASS |
| 5 | Deterministic sample counts (3 red / 6 amber / 0 green); rules are the count source, cloud is commentary | `src/lib/judge.ts`, `src/lib/rules.ts`, `src/components/Results.tsx` | PASS |
| 6 | Preliminary tiles with live timer; verdict line only when final | `src/components/Results.tsx` | PASS |
| 7 | Only "Send to cloud Gemini" and "Cancel" while consent is open | `src/App.tsx` | PASS |
| 8 | Plain-language badges (raw inferenceSource in tooltip); one-line Judge bar | `src/components/Badges.tsx`, `src/App.tsx` | PASS |
| 9 | Checklist and handoff match reality | this file, `docs/HANDOFF-PORTIA.md` | PASS |
| 10 | Glanceable review: cost math + Approve above the 1280x800 fold | `src/components/ExtractEditor.tsx` | PASS |

Copy note: the requested strings with an em dash are rendered with a colon or full stop ("Preliminary: playbook rules in your browser", "Extracted in the cloud. Gemini Nano is not on this device"), per Fluid's standing no-em-dash preference.

## Addendum 4 (win push) status

| # | Item | Where | Status |
| --- | --- | --- | --- |
| 1 | Offline verdict from in-browser rules (`RULES_ONLY`, "Offline: checked on this device", "Run cloud review now") | `src/lib/network.ts`, `src/App.tsx`, `src/components/Results.tsx` | Done |
| 2 | Privacy receipt with measured lease-text overlap | `src/lib/receipt.ts`, `src/components/Receipt.tsx` | Done. The sample measures 144 characters, so its headline does not claim 0 |
| 3 | PDF intake in the browser | `src/lib/pdf.ts`, `src/components/Intake.tsx` | Done |
| 4 | Thin-extract guard and preliminary state hardening | `ExtractEditor.tsx`, `Results.tsx` | Done |
| 5 | No-Nano copy audit | `index.html` meta description fixed | Done |
| 6 | Copy all and email the landlord questions | `src/lib/share.ts` | Done |
| 7 | Accuracy eval harness, `/eval` | `eval/`, `scripts/eval-score.mjs`, `src/components/Eval.tsx` | Done; **no results recorded** (needs a real run by Fluid, see `eval/README.md`) |
| 8 | Remote Config with safe defaults | `src/lib/config.ts`, `src/lib/firebase.ts` | Done; template to be created in the console (HANDOFF 7c) |
| 9a | OG image and social tags | `public/og.png`, `index.html` | Done |
| 9b | PWA manifest and service worker | `public/manifest.webmanifest`, `public/sw.js`, `vercel.json` | Done |
| 9c | Accessibility pass | `Results.tsx` | Done |
| 9d | Spanish toggle | | **Skipped**: a partial translation of the tool path would have been half-built UI |
| 10 | Docs ordered by the four criteria | `README.md`, `docs/DEVPOST.md` | Done |

Canonical sample numbers unchanged: 3 red / 6 amber / 0 green, rent $1,850, required fees $111.95, true monthly cost $1,961.95, due at signing $6,931.95 (was $6,586.95 in v1.0.0-devpost, which left out the clause 5 move-in fees).
