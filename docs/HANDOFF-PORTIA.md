# Handoff checklist: Portia bot (browser work)

Status as of 2026-11-15. The code is on `main` of `levithefirst/portia` (private) and auto-deploys to **https://askportia.vercel.app**. Items 1 to 7b are **DONE** (kept below for reference). Everything below happens in a browser. **The Portia bot did items 1 to 7b and does item 8. Fluid only does item 9.** Claude Code does none of these.

Rules for every step:
- Use the Google account **josephmorounfoluwa@gmail.com**. Fallback only if that account cannot be used: memequant@mail.grokbot.com. **Never use leviweb3x@gmail.com** for anything.
- Never paste keys, tokens or config values into GitHub, this repo, chat, or Devpost. They go only into the Vercel dashboard (and a local `.env` that is never committed).
- If a console label differs from what is written here, follow the live wizard / official docs. Links are given for each step.

Project ID: **portia-f1dbe** (already created). Firebase AI Logic on the Gemini Developer API and App Check with reCAPTCHA Enterprise were reported as already set up and enforced; items 2, 4 and 5 are verification steps in that case.

Public app URL: **https://askportia.vercel.app** (Judge Mode: https://askportia.vercel.app/?judge=1). Repo URL: https://github.com/levithefirst/portia (private until item 8).

---

1. **Sign in and open the project.** Sign into Google as josephmorounfoluwa@gmail.com. Open https://console.firebase.google.com/ and select project `portia-f1dbe`. Record any change of project ID at the top of this file.

2. **Confirm Firebase AI Logic (Gemini Developer API).** Docs: https://firebase.google.com/docs/ai-logic/hybrid/web/get-started (Step 2). In the Firebase console go to **AI Services > AI Logic**. If it is not set up, click **Get started** and follow the guided workflow; when asked for a "Gemini API provider", choose **Gemini Developer API** (Nigeria is eligible; do not switch to a blocked provider). Complete the workflow so the required APIs are enabled.

3. **Register the web app and copy config to Vercel.** Firebase console > Project settings (gear) > **Your apps**. If there is no Web app, add one (nickname `portia-web`; Firebase Hosting not needed). Copy the `firebaseConfig` values into Vercel (item 7) with these names:
   | firebaseConfig key | Vercel env var |
   | --- | --- |
   | apiKey | `VITE_FIREBASE_API_KEY` |
   | authDomain | `VITE_FIREBASE_AUTH_DOMAIN` |
   | projectId | `VITE_FIREBASE_PROJECT_ID` |
   | storageBucket | `VITE_FIREBASE_STORAGE_BUCKET` |
   | messagingSenderId | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
   | appId | `VITE_FIREBASE_APP_ID` |

   Do not paste these anywhere else.

4. **Confirm App Check is Enforced for Firebase AI Logic.** Docs: https://firebase.google.com/docs/ai-logic/app-check and https://firebase.google.com/docs/app-check/enable-enforcement. Firebase console > **Security > App Check > APIs** tab. Firebase AI Logic should show **Enforced**. If it shows Unenforced, follow the official enforce instructions on the enable-enforcement page.

5. **reCAPTCHA Enterprise provider for production.** Docs: https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider.
   1. Google Cloud console > **Fraud Defense** page (https://console.cloud.google.com/security/recaptcha), project `portia-f1dbe`. Enable the reCAPTCHA Enterprise API if prompted.
   2. Create (or open the existing) **Web** key. Add every production domain, at minimum the Vercel production domain from item 7 (for example `portia-xxxx.vercel.app`) and any custom domain. **Do not add `localhost`.** Leave "Use checkbox challenge" **unselected**.
   3. Firebase console > **Security > App Check > Apps** tab: the web app must be registered with the reCAPTCHA Enterprise provider using that key. Click **Save**.
   4. Put the key only in Vercel as `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`. Never commit it.

6. **Debug token for local or preview DEV builds (optional).** Only needed to run `npm run dev` against the real project. The code sets `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` only in DEV builds. Run the dev server, open the browser console, copy the line `Firebase App Check debug token: ...`, then Firebase console > **Security > App Check > Apps** tab > the web app's overflow menu (⋮) > **Manage debug tokens** > add it. Never commit or share the token. Production builds on Vercel never use the debug provider.

7. **Deploy on Vercel.** Docs: https://vercel.com/docs/git.
   1. Get the code onto `main`: on GitHub open a pull request from `ccr-edea3bc3-ui3mci` into `main` and merge it (or, if preferred, set the Vercel production branch to `ccr-edea3bc3-ui3mci`).
   2. Vercel dashboard (signed in with the same Google/GitHub identity used for this project, never leviweb3x@gmail.com) > **Add New > Project > Import Git Repository** > `levithefirst/portia`. Grant the Vercel GitHub app access to this private repo if asked.
   3. Framework preset: **Vite**. Build command `npm run build`, output directory `dist` (also set in `vercel.json`). Production branch: `main`.
   4. **Settings > Environment Variables**: add all seven `VITE_*` variables from `.env.example` for Production (and Preview if wanted). Values from items 3 and 5.
   5. Deploy. Confirm `vercel.json` rewrites work: open `https://<domain>/privacy` directly; it must load the Privacy page, not a 404.
   6. Add the production domain to the reCAPTCHA key (item 5.2) if not already there, then redeploy.
   7. Smoke check in desktop Chrome: the page must **not** show "AI is not configured in this build". Load sample lease > Extract. Without Nano you should see the consent banner; accept, and the badge reads `Extract: IN_CLOUD`. Approve & check shows `Check: IN_CLOUD` and red/amber findings.
   8. Record the public HTTPS URL at the top of this file and in `docs/DEVPOST.md` (replace `https://askportia.vercel.app`), by editing on GitHub.

7b. **DONE (2026-11-14 18:03 UTC): bundled Judge Mode verdict recorded** in `src/fixtures/sample-verdict.json` from a live `in_cloud` run. Note: that run misread the notice period as 2700 days (the lease says 90). `src/fixtures/sample-extract.json` mirrors the recorded extract with notice corrected to 90, and recorded cloud commentary on any field whose value differs is not shown. Re-recording is optional; steps kept for reference:
   1. Open `https://<domain>/?judge=1&record=1` in desktop Chrome.
   2. Click **Load sample lease** and do not edit the text. Keep the playbook on **US-typical**.
   3. Click **Extract fee map** (accept the consent banner if shown). On the review screen, do not edit anything. Click **Approve & check**.
   4. Wait for the badge `Check: IN_CLOUD` (not `CACHED SAMPLE`). A "Record mode" box appears. Click **Download verdict fixture (sample-verdict.json)**.
   5. Open the downloaded file and confirm `"recorded": true`, `"inferenceSource": "in_cloud"`, and that it contains only the fields `note`, `playbookId`, `model`, `recordedAt`, `rawText`, `approvedExtract`. It contains no keys or tokens.
   6. On GitHub, open `src/fixtures/sample-verdict.json` on `main`, choose **Edit** (or upload), replace the contents with the downloaded file, and commit to `main` with the message `Record Judge Mode sample verdict`. Vercel redeploys automatically.
   7. Check: open `https://<domain>/?judge=1` and confirm the app still loads.

7c. **Optional: create the Remote Config template** (the app works without it; defaults apply). Firebase console > project `portia-f1dbe` > **Run > Remote Config** (follow the live console label if it differs) > create these parameters, then **Publish changes**. Never put secrets here.
   | Key | Type | Default value |
   | --- | --- | --- |
   | `cloud_model` | String | `gemini-3.5-flash-lite` (only `gemini-3.5-flash-lite` or `gemini-3.8-flash` are accepted) |
   | `judge_timeout_ms` | Number | `8000` (the app clamps to 3000..20000) |
   | `extract_thin_retry` | Boolean | `true` |
   | `playbook_min_version` | String | empty |
   Check: open https://askportia.vercel.app/?judge=1, run the sample, and the receipt footer reads "source remote".

7d. **Optional: record an eval run** on a Gemini Nano machine (Fluid, normal Chrome window): follow `eval/README.md`, then commit only `eval/results/summary-*.json`.

8. **Make the repo public, only after Fluid explicitly OKs it, and before the Devpost submit.** GitHub > `levithefirst/portia` > Settings > General > Danger Zone > Change visibility > Public. Then confirm the **Apache-2.0** license shows in the repo's **About** section (right sidebar). If it does not, check that `LICENSE` is on the default branch (`main`). Claude Code must not flip visibility.

9. **Fluid only (not the Portia bot, not Claude Code).**
   1. Optional desktop setup for the on-device take: Chrome 139+ on desktop, enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` (official) and search `chrome://flags` for "Gemma 4 for Built-in AI" (hackathon FAQ), restart, open Portia, click **Prepare on-device model** and wait for the download.
   2. Record the 3-minute-or-shorter English YouTube demo following `docs/DEMO-SCRIPT.md`. Upload early (processing can take hours), public or unlisted as Devpost requires.
   3. In the Devpost testing instructions, give judges the Judge Mode link `https://askportia.vercel.app/?judge=1` (already in `docs/DEVPOST.md`).
   4. Submit on Devpost **before Mon 30 Nov 2026, 11:00 PM WAT** (= 2:00 PM PT = 5:00 PM EST; the FAQ says commits after the deadline are not evaluated) with the public repo URL, the YouTube URL, the app URL, platform **Web (Chrome)**, and the text in `docs/DEVPOST.md`. No agent submits or posts.

---

## Current blockers (only these remain)

| Item | Who | Notes |
| --- | --- | --- |
| Make the repo public (+ confirm Apache-2.0 in About) | Portia bot, item 8, only after Fluid's OK | Before the Devpost submit |
| Video (3 min max, English, YouTube) and Devpost submission | Fluid only, item 9 | Follow `docs/DEMO-SCRIPT.md`; deadline Mon 30 Nov 2026, 11:00 PM WAT |
| ON_DEVICE capture on Nano-enabled desktop Chrome | Fluid, item 9.1 | Needed for the on-device take of the video; no code change required |
