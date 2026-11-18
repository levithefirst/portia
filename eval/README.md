# Portia accuracy eval

Measures how well the extract step turns a lease into the fee map, on 30 **SYNTHETIC** leases. No real names, addresses or companies. Every `.txt` starts with `SYNTHETIC TEST LEASE` and every `.json` has `"synthetic": true`.

| Split | Files | How they were made |
| --- | --- | --- |
| `fixtures/holdout/` | 10 | Written blind, in their own commit ("Item 7a: eval holdout fixtures, written blind"), before the dev set and before any prompt tuning. Seed 9001. |
| `fixtures/dev/` | 20 | Written after the holdout set. Seed 1234. |

Both were produced by `scripts/make-eval-fixtures.mjs`, which builds the lease text and the ground truth from the same random parameters, so the answers are correct by construction. Styles: US, England and Wales, Lagos; clause, schedule and prose formats; planted mandatory fees (technology, amenity, admin, agency, service charges and more).

## What is measured

`npm run eval:score -- results.json` prints, overall and split dev vs holdout:

- **Fee recall**: planted required fees found. A fee counts when an extracted fee has the same amount (within 1 cent) and the same frequency kind (monthly, yearly, one-time). Names are not compared.
- **Exact dollar match** (within 1 cent) for rent, deposit, late fee and total monthly fees.
- **True monthly cost** exact match (monthly rent + required monthly fees).
- **Extract latency**: median and p90, in ms.
- **Where it ran**: share of extracts with `inferenceSource` ON_DEVICE vs IN_CLOUD, as reported by the SDK.

It writes `eval/results/summary-<date>-<ranOn>.json`. The public page `/eval` shows every committed summary. With none committed it says "No eval run recorded yet." Portia never shows placeholder numbers.

## How Fluid runs it on a Gemini Nano machine

1. Desktop Chrome 139+ with the flags from the main README. Open https://askportia.vercel.app/app once and click **Prepare on-device model**; wait for the download.
2. Use a **normal Chrome window**. Browser automation (Playwright, Puppeteer, remote debugging) may disable built-in AI, so do not run this from a test harness.
3. Open https://askportia.vercel.app/eval?run=1.
4. Choose the split (All 30 is the default) and type a short machine note (for example "MacBook, Chrome 141, flags on").
5. For a pure on-device run, leave the cloud box unticked: with Nano ready, every extract runs on-device and the gate never needs cloud. If you want a cloud-path run, tick "These are synthetic test leases; allow cloud". That box is the consent for these synthetic files only. Optionally tick the cloud check too.
6. Click **Start**. Calls are paced at least 4 seconds apart to respect free-tier limits; 30 fixtures take a few minutes.
7. Click **Download results JSON**.
8. On a computer with the repo: `npm run eval:score -- ~/Downloads/portia-eval-<date>.json`. This writes `eval/results/summary-<date>-ON_DEVICE.json` (or `IN_CLOUD`, or `MIXED`).
9. Commit only that summary file (the raw results file is optional). After deploy, `/eval` shows it.

The summary is labelled with where the extracts actually ran, from the SDK's `inferenceSource`. Do not relabel it.

## Status

No eval run has been recorded yet. Claude Code could not run it: its build environment has no Firebase keys and no Gemini Nano.
