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
| Hosted URL (strongly encouraged) | `vercel.json`; URL recorded after deploy | Handoff #7 |
| Free to evaluate, no login | No account; Gemini Developer API free tier | Repo |
| All materials in English | UI and docs in English | Repo |
| No secrets, keys, debug tokens or PII in repo/form | `.gitignore`, `.env.example` blank, secret grep clean (below) | Repo |
| Existing-app disclosure | New project; stated in `docs/DEVPOST.md` | Repo |
| Submit before deadline; commits after deadline not evaluated | | Fluid (Handoff #9) |

## Judging criteria (equal weight)

| Criterion | Evidence in Portia |
| --- | --- |
| **1. Technological Implementation**: how well built, how effectively it uses Firebase AI Logic hybrid inference | Two model instances with different inference modes per feature (the FAQ's recommended pattern). Structured output on both sides via one `Schema` (`responseConstraint` + `responseSchema`). `initializeDeviceModel` on a gesture with progress. Privacy gate that mirrors the SDK's on-device checks to block silent fallback (`src/lib/onDevice.ts`, `src/lib/pipeline.ts`). `inferenceSource` badges. App Check. Deterministic in-browser rule engine plus cloud review merge; uncited reds capped. 18 unit tests and a 30-check Playwright + axe smoke test. |
| **2. Design**: complete, coherent product, not a proof of concept | Three-step flow (Document > Review > Clause map), editable extract, true monthly cost, printable question list, light/dark/phone layouts, ink-on-paper theme with semantic status colors plus icons and text labels, empty/loading/error/retry/download states, Privacy page, setup state that still works without keys. |
| **3. Potential Impact**: credible, specific case for a real audience, demonstrated | Renters before signing. Verified stats (Furth-Matzkin 2017; Weightmans 2024; AppFolio 2026) and FTC enforcement ($49.75M Progress Residential, $48M Invitation Homes). Playbooks for the US, England & Wales, Lagos, and a general junk-fee pack. Works on a Pixel 7 via consent. |
| **4. Quality of the Idea**: creative, non-obvious use of Firebase AI Logic; understanding of the problem | Hybrid split by data sensitivity: the private document stays on-device; only a user-approved, minimal JSON reaches the cloud. Output is a structured fee map with citations and landlord questions, not a summary. Honest about the fallback trap in PREFER_ON_DEVICE and designs around it. |

## Self-verification (Milestone 5), run 2026-11-14

| Check | Result |
| --- | --- |
| `npm ci && npm run build` | PASS |
| `npm test` (vitest, 18 tests) | PASS |
| `npm run test:smoke` (30 checks incl. axe on intake, review, results light/dark, consent, privacy) | PASS |
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
| Public HTTPS URL | **BLOCKED** until Handoff #3, #5, #7 |
| Live ON_DEVICE run against `portia-f1dbe` | **BLOCKED** until Handoff #7 (or #6 locally) and a Chrome with Nano |
