# Demo script (3:00 max, English)

Recorded by Fluid only. Two takes: desktop Chrome with Gemini Nano ready (Take A), and the Pixel 7 no-Nano path (Take B). Upload to YouTube early. Do not show keys, the Firebase console config, or DevTools Application storage.

Prep: desktop Chrome 139+, flags enabled per README, Gemini Nano already downloaded (click **Prepare on-device model** before recording). Open the deployed app URL. Theme: light. Zoom 110% so badges are readable.

## 0:00 to 0:30 (the bar: who, problem, how)

| Time | Screen | Voiceover |
| --- | --- | --- |
| 0:00 | Portia home, headline visible | "Portia is for renters, anyone about to sign a lease, a tenancy agreement or a storage contract." |
| 0:07 | Scroll slightly to the "Why this matters" card | "Leases hide junk fees and terms that may not hold up. In one study, 73% of Boston leases had at least one unenforceable clause, and most people don't fully read what they sign. This month the FTC ordered Progress Residential to pay 49.75 million dollars over hidden rental fees." |
| 0:20 | Point at the 3-step strip (Extract on-device / Review / Check in the cloud) | "Portia uses Firebase AI Logic hybrid inference. Gemini Nano extracts a fee map on your device, you approve it, and only that JSON goes to cloud Gemini for scoring. Every call shows where it ran." |

## 0:30 to 2:15 (Take A, desktop Chrome, on-device)

| Time | Screen | Voiceover |
| --- | --- | --- |
| 0:30 | Extraction engine card: "Gemini Nano is ready on this device" | "Nano is ready in this Chrome." |
| 0:35 | Click **Load sample lease** (or **Load sample photos** to show JPEG/PNG pages) | "Here's a sample lease with tech, amenity and valet trash fees, a late fee from day one, and auto-renewal." |
| 0:45 | Click **Extract fee map**. Wait. Badge **Extract: ON_DEVICE** appears | "The extract ran on-device. The badge comes straight from the SDK's inferenceSource. The lease never left this laptop." |
| 1:00 | Review screen: scroll the fields and fee table; show "What it really costs" | "It's a structured map, not a summary: rent, deposit, late fee, grace days, every mandatory fee, notice period. The true monthly cost is 1,962, not 1,850." |
| 1:15 | Change one value (for example grace days 0 to 0, or mark Deposit "I'm not sure"). Open "Exactly what Approve & check sends" | "I can fix anything and mark fields I'm unsure about. This is exactly what will be sent: JSON only." |
| 1:30 | Click **Approve & check**. Badge **Check: IN_CLOUD** | "The check runs in the cloud on the approved JSON only, against a US playbook." |
| 1:40 | Results: counts, a RED fee finding with citation, a RED grace period finding, AMBER auto-renewal | "Red means push back, amber means ask. Each flag cites a playbook rule and its source, and the rules also run in the browser, so this isn't just model prose." |
| 1:58 | Scroll to **Questions for the landlord**, click **Print or save as PDF** | "I get a list of questions to send before I sign." |
| 2:08 | Switch playbook to **Lagos** or **England & Wales** briefly (optional) | "Playbooks cover the US, England and Wales, Lagos, and a general junk-fee pack." |

## 2:15 to 2:50 (Take B, Pixel 7 or phone, no Nano)

| Time | Screen | Voiceover |
| --- | --- | --- |
| 2:15 | Portia on the Pixel 7: card says "This browser cannot run Gemini Nano" | "On a Pixel 7, Chrome can't run Gemini Nano." |
| 2:22 | Load sample, tap Extract. **Consent banner** appears | "Portia won't silently fall back to the cloud with my lease. It asks first." |
| 2:32 | Tap **Send to cloud Gemini**. Badge **Extract: IN_CLOUD** | "With my consent it runs in the cloud, and the badge says so." |
| 2:40 | Approve & check, results | "Same review, same approved-JSON-only check." |

## 2:50 to 3:00 close

| Screen | Voiceover |
| --- | --- |
| Footer "Not legal advice" | "Portia isn't legal advice. It's a fee map and a question list, private by default. Built with Firebase AI Logic." |

Notes:
- Do not claim anything is illegal. Do not say Nano ran on the Pixel 7.
- If Take A cannot get Nano ready, record it anyway with the consent path and say so; do not fake the ON_DEVICE badge.
- Record with `?judge=1` so the result card shows `Verdict in ...s`. If the clip shows "Cached sample result (live check unavailable)", either say so on camera or re-take once the live check works; never present the cached result as live.
- Keep total under 3:00 (only the first 3 minutes are judged).
