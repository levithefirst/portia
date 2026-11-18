import { CLOUD_MODEL } from '../lib/firebase'

export function Privacy() {
  return (
    <article className="mx-auto max-w-3xl space-y-6 text-[0.95rem] leading-relaxed">
      <header>
        <p className="eyebrow">Privacy</p>
        <h1 className="mt-1 font-serif text-4xl font-medium">How your data flows</h1>
        <p className="mt-2 text-text-secondary">
          This page describes what the code in this app actually does. Portia is a client-only web app with no server, no
          account and no database of its own.
        </p>
      </header>

      <section className="paper p-5">
        <h2 className="text-lg font-semibold">1. Extract: on your device when possible</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            Portia reads your pasted text, PDFs, or JPEG/PNG page photos in the browser. A PDF is parsed in this browser by
            pdf.js: its text goes into the text box, or, for a scanned PDF, its pages are turned into PNG images here. Parsing a
            PDF sends nothing anywhere. Other file types are rejected.
          </li>
          <li>
            The extract model uses Firebase AI Logic in <span className="font-mono text-sm">PREFER_ON_DEVICE</span> mode. When
            Chrome's built-in Gemini Nano is ready, the lease is processed on your device and never leaves it. The badge reads{' '}
            <span className="font-mono text-sm">ON_DEVICE</span>.
          </li>
          <li>
            Before every extract, Portia checks whether the request will actually run on-device (the same checks the Firebase SDK
            makes). If it will not, Portia stops and shows a consent banner. Nothing is sent until you press "Send to cloud
            Gemini". There is no silent fallback.
          </li>
          <li>
            If you consent, your text and photos are sent to Google's cloud Gemini model (
            <span className="font-mono text-sm">{CLOUD_MODEL}</span>) through Firebase AI Logic. The badge reads{' '}
            <span className="font-mono text-sm">IN_CLOUD</span>. Consent applies to the current document only and resets when
            you change it.
          </li>
        </ul>
      </section>

      <section className="paper p-5">
        <h2 className="text-lg font-semibold">2. Review: you approve the JSON</h2>
        <p className="mt-2">
          The extract is a short structured map (amounts, fees, notice days, a few one-line summaries). You can edit every field,
          mark fields as "not sure", and see the exact payload before approving. Anything you type into a field, including notes,
          is part of what you approve.
        </p>
      </section>

      <section className="paper p-5">
        <h2 className="text-lg font-semibold">3. Check: only the approved JSON goes to the cloud</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            The check model uses <span className="font-mono text-sm">ONLY_IN_CLOUD</span>. Its request contains instructions, the
            selected playbook's public rules, your approved JSON and the list of fields you marked "not sure". It never contains
            the lease text or page photos.
          </li>
          <li>Playbook rules also run locally in your browser on the same JSON, so results do not depend only on model output.</li>
          <li>You can view the exact text sent to the check model on the results screen.</li>
        </ul>
      </section>

      <section className="paper p-5">
        <h2 className="text-lg font-semibold">Storage and security</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            "Remember my last approved extract" is off by default. If you turn it on, only the approved JSON and the playbook id are
            saved in this browser's localStorage. Lease text and photos are never stored. Turning it off deletes the saved copy.
          </li>
          <li>Your theme choice is saved in localStorage.</li>
          <li>
            After every run, a privacy receipt lists each step, where it ran and what left this device, measured from the request
            Portia actually passed to Firebase AI Logic.
          </li>
          <li>
            On the tool pages, Portia asks Firebase Remote Config for a few settings (cloud model name, timeouts). That request
            contains no document data. If it fails, built-in defaults are used.
          </li>
          <li>
            The installed app shell (pages, scripts and styles) is cached by a service worker so Portia opens offline. It never
            caches your lease, and it never handles requests to Firebase, Google or reCAPTCHA.
          </li>
          <li>
            Judge Mode (<span className="font-mono text-sm">?judge=1</span>) sets a flag in sessionStorage for this tab and
            initialises Firebase and App Check as soon as the page loads instead of on your first click. It sends no document
            data. For the unmodified sample lease only, it can show a bundled sample verdict, clearly labelled, if the live check
            is unavailable.
          </li>
          <li>
            Requests to Firebase AI Logic are protected by Firebase App Check with reCAPTCHA Enterprise, which evaluates the browser
            session to block abuse of the API.
          </li>
          <li>Fonts are loaded from Google Fonts. The app is hosted on Vercel.</li>
          <li>No analytics, no ads, no account.</li>
        </ul>
      </section>

      <p className="text-sm text-text-secondary">
        Not legal advice. Portia's playbooks are curated static checklists, not a statute database.
      </p>
    </article>
  )
}
