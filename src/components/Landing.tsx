import { useEffect, useMemo, useState, type ReactNode } from 'react'
import sampleExtract from '../fixtures/sample-extract.json'
import { getPlaybook, PLAYBOOKS } from '../lib/playbooks'
import { formatMoney, monthlyRent, runPlaybook, sortFindings, totalMonthlyFees } from '../lib/rules'
import type { DeviceAvailability } from '../lib/onDevice'
import type { LeaseExtract, Status } from '../lib/types'
import { StatusPill } from './Badges'
import { heroLine } from './DeviceStatus'
import { IconChip, IconCloud, IconLock } from './icons'
import { LogoMark, navigate } from './Shell'

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Counts up to the final value. The final value is what renders first and what stays if motion is reduced. */
function useCountTo(steps: number[], startDelay: number, stepMs: number) {
  const final = steps[steps.length - 1]
  const [v, setV] = useState(final)
  useEffect(() => {
    if (reduced()) return
    let raf = 0
    const t0 = performance.now() + startDelay
    setV(steps[0])
    const tick = (now: number) => {
      const t = now - t0
      if (t < 0) return void (raf = requestAnimationFrame(tick))
      const i = Math.min(steps.length - 2, Math.floor(t / stepMs))
      const k = Math.min(1, (t - i * stepMs) / (stepMs * 0.7))
      const e = 1 - Math.pow(1 - k, 3)
      setV(steps[i] + (steps[i + 1] - steps[i]) * e)
      if (t < (steps.length - 1) * stepMs) raf = requestAnimationFrame(tick)
      else setV(final)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return v
}

function AppLink({ children, className, testId }: { children: ReactNode; className: string; testId?: string }) {
  return (
    <a
      href="/app"
      className={`${className} no-underline`}
      data-testid={testId}
      onClick={(e) => {
        e.preventDefault()
        navigate('check')
      }}
    >
      {children}
    </a>
  )
}

export function Landing({ avail }: { avail: DeviceAvailability | 'checking' }) {
  const s = useMemo(() => {
    const x = sampleExtract as unknown as LeaseExtract
    const pb = getPlaybook('us-typical')
    const rules = sortFindings(runPlaybook(pb, x)).filter((f) => f.origin === 'playbook-rule')
    const rent = monthlyRent(x) ?? 0
    const fees = totalMonthlyFees(x)
    const n = (st: Status) => rules.filter((f) => f.status === st).length
    return { x, pb, rules, rent, fees, cur: x.currency, red: n('RED'), amber: n('AMBER'), green: n('GREEN') }
  }, [])
  const money = (v: number) => formatMoney(v, s.cur)

  return (
    <div className="landing">
      <Hero money={money} />
      <Problem rent={money(s.rent)} total={money(s.rent + s.fees)} />
      <How />
      <Hybrid avail={avail} />
      <PrivacyGrid />
      <Sample s={s} money={money} />
      <Faq />
      <Closing />
    </div>
  )
}

/* ---------- Hero: the lease gets scanned ---------- */
const FEES = [
  { label: 'Rent', amount: 1850, clause: '1' },
  { label: 'Technology Package', amount: 45, clause: '4(a)' },
  { label: 'Community Amenity Fee', amount: 35, clause: '4(b)' },
  { label: 'Valet Trash Service', amount: 25, clause: '4(c)' },
  { label: 'Utility Billing Admin', amount: 6.95, clause: '4(d)' },
]

function Hero({ money }: { money: (v: number) => string }) {
  const steps = FEES.reduce<number[]>((a, f) => [...a, (a[a.length - 1] ?? 0) + f.amount], [])
  const v = useCountTo(steps, 1500, 520)
  return (
    <section className="lp-hero relative grid items-center gap-12 pt-10 pb-20 lg:min-h-[calc(100vh-57px)] lg:grid-cols-12 lg:gap-8 lg:pt-6 lg:pb-12" aria-labelledby="landing-title">
      <div className="lp-light" aria-hidden="true" />
      <div className="relative lg:col-span-6">
        <div className="flex items-center gap-3">
          <LogoMark size={44} />
          <span className="eyebrow">Lease fee and obligation checker</span>
        </div>
        <h1 id="landing-title" className="lp-display mt-8">
          <span className="reveal-line"><span>Every fee.</span></span>{' '}
          <span className="reveal-line"><span>Every clause.</span></span>{' '}
          <span className="reveal-line"><span><em>Before</em> you sign.</span></span>
        </h1>
        <p className="lp-rise mt-7 max-w-[46ch] text-[1.1rem] leading-relaxed text-text-secondary">
          Portia reads a rental agreement, finds the true monthly cost and flags terms worth questioning. On your device when it
          can. In the cloud only when you say so.
        </p>
        <div className="lp-rise mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: '120ms' }}>
          <AppLink className="btn btn-primary btn-lg lp-cta" testId="cta-check">
            Check a lease <span aria-hidden="true" className="lp-arrow">→</span>
          </AppLink>
          <a href="#sample" className="btn btn-ghost btn-lg">
            See a sample verdict
          </a>
        </div>
        <p className="mt-6 font-mono text-[0.72rem] text-text-secondary">No account · pasted text or page photos · not legal advice</p>
      </div>

      <div className="relative lg:col-span-6">
        <figure className="scan-stage relative m-0" aria-label="Animation: Portia scans the sample lease, highlights clauses and adds up the true monthly cost">
          <div className="scan-doc paper relative overflow-hidden">
            <div className="scan-beam" aria-hidden="true" />
            <div className="flex items-baseline justify-between border-b border-border-subtle px-6 pt-5 pb-3">
              <p className="font-serif text-[1rem] font-medium">Residential Lease Agreement</p>
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.1em] text-text-secondary">Sample lease · p.1</p>
            </div>
            <div className="space-y-3 px-6 pt-4 pb-6 font-serif text-[0.88rem] leading-[1.55] sm:text-[0.92rem]">
              <p><span className="clause-no">1.</span> Tenant shall pay monthly rent of <mark className="hl hl-ink" style={{ ['--d' as string]: '0.35s' }}>$1,850.00</mark>, due on the 1st day of each month.</p>
              <p><span className="clause-no">2.</span> Upon signing, Tenant shall pay a security deposit of <mark className="hl hl-red" style={{ ['--d' as string]: '0.6s' }}>$4,625.00 (two and one-half months of rent)</mark>.</p>
              <p><span className="clause-no">3.</span> Rent not received by 11:59 p.m. on the 1st is late. <mark className="hl hl-red" style={{ ['--d' as string]: '0.9s' }}>Tenant shall pay an initial late charge of $150.00</mark>.</p>
              <p><span className="clause-no">4.</span> The following services are <mark className="hl hl-red" style={{ ['--d' as string]: '1.2s' }}>mandatory for all residents</mark>: Technology Package $45.00, Community Amenity Fee $35.00, Valet Trash $25.00, Utility Billing Administration $6.95 per month.</p>
              <p className="hidden sm:block"><span className="clause-no">6.</span> This Lease shall <mark className="hl hl-amber" style={{ ['--d' as string]: '1.5s' }}>automatically renew</mark> unless Tenant gives notice at least ninety (90) days before the end of the term.</p>
              <p className="hidden sm:block"><span className="clause-no">7.</span> Tenant shall pay an <mark className="hl hl-amber" style={{ ['--d' as string]: '1.75s' }}>early termination fee equal to three (3) months of rent</mark>.</p>
            </div>
          </div>
          <div className="scan-receipt relative mt-[-3.5rem] ml-auto w-[min(100%,20rem)] rounded-2xl p-5 lg:absolute lg:right-[-0.5rem] lg:bottom-[-4.5rem] lg:mt-0">
            <p className="muted font-mono text-[0.62rem] uppercase tracking-[0.1em]">True monthly cost · sample lease</p>
            <p className="cost-figure mt-2 text-[2.9rem]" data-testid="hero-total" aria-label={`${money(steps[steps.length - 1])} a month`}>
              {money(v)}
            </p>
            <ul className="mt-3 space-y-1 font-mono text-[0.7rem]">
              {FEES.map((f, i) => (
                <li key={f.label} className="receipt-line flex justify-between gap-3" style={{ ['--d' as string]: `${1.5 + i * 0.52}s` }}>
                  <span className="muted">{i === 0 ? '' : '+ '}{f.label}</span>
                  <span>{money(f.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        </figure>
      </div>
    </section>
  )
}

/* ---------- Problem: editorial big type on ink ---------- */
function Problem({ rent, total }: { rent: string; total: string }) {
  return (
    <section className="bleed ink-band" aria-labelledby="problem-title">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-36">
        <p className="eyebrow muted">The problem</p>
        <h2 id="problem-title" className="lp-statement mt-6">
          The ad says <span className="whitespace-nowrap">{rent}.</span> The lease says <em className="whitespace-nowrap">{total}.</em>
        </h2>
        <p className="muted mt-6 max-w-[56ch] text-[1.05rem]">
          That gap is four mandatory monthly fees in the sample lease, written in plain sight in clause 4. Most leases are long, and
          most people sign them anyway.
        </p>
        <div className="mt-16 grid gap-10 ink-rule pt-10 md:grid-cols-3">
          <Fig n="73%" t="of 70 Greater Boston leases contained at least one unenforceable clause." src="Furth-Matzkin, Journal of Legal Analysis, 2017" />
          <Fig n="24%" t="of UK tenants read the tenancy agreement before signing." src="Weightmans / The Negotiator, May 2024" />
          <Fig n="$49.75M" t="ordered from Progress Residential / Pretium over hidden rental fees, after $48M from Invitation Homes in 2024." src="FTC, November 2026" />
        </div>
      </div>
    </section>
  )
}
function Fig({ n, t, src }: { n: string; t: string; src: string }) {
  return (
    <div>
      <p className="cost-figure text-[3.4rem] sm:text-[4.2rem]">{n}</p>
      <p className="mt-3 max-w-[34ch] leading-relaxed">{t}</p>
      <p className="muted mt-2 font-mono text-[0.7rem]">{src}</p>
    </div>
  )
}

/* ---------- How it works: sticky scroll story ---------- */
function How() {
  return (
    <section id="how" className="py-24 sm:py-36" aria-labelledby="how-title">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <p className="eyebrow">How it works</p>
            <h2 id="how-title" className="lp-h2 mt-4">Three steps. You approve every one.</h2>
            <p className="mt-5 max-w-[40ch] text-text-secondary">The model reads. The rules judge. You decide what leaves your hands.</p>
          </div>
        </div>
        <ol className="space-y-6 lg:col-span-7">
          <Story n="01" title="Extract the fee map" icon={<IconChip width={16} height={16} />}>
            <p>Paste the lease or add photos of each page. Portia turns twelve pages into a short structured map.</p>
            <div className="mock mt-5 font-mono text-[0.72rem]">
              {[['rent', '$1,850.00'], ['deposit', '$4,625.00'], ['lateFeeGraceDays', '0'], ['recurringFees', '4 items · $111.95'], ['renewalNoticeDays', '90']].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-border-subtle py-1.5 last:border-0"><span className="text-text-secondary">{k}</span><span>{v}</span></div>
              ))}
            </div>
          </Story>
          <Story n="02" title="Review and approve" icon={<IconLock width={16} height={16} />}>
            <p>Edit any field, mark what you are not sure about, and see the exact payload. Nothing is checked until you press Approve.</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="btn btn-primary pointer-events-none text-sm" aria-hidden="true">Approve &amp; check</span>
              <span className="rounded-full border border-dashed border-border px-3 py-1 text-xs text-text-secondary">1 field marked not sure</span>
            </div>
          </Story>
          <Story n="03" title="Read the clause map" icon={<IconCloud width={16} height={16} />}>
            <p>Playbook rules run in your browser and score each term red, amber or green, with a citation and a question to send the landlord.</p>
            <div className="mt-5 flex h-2.5 gap-[3px]" aria-hidden="true">
              {['RED', 'RED', 'RED', 'AMBER', 'AMBER', 'AMBER', 'AMBER', 'AMBER', 'AMBER'].map((c, i) => <span key={i} className={`flex-1 rounded-[3px] seg-${c}`} />)}
            </div>
            <p className="ask mt-4 rounded-r-lg bg-bg py-2 pl-3.5 font-serif text-[1rem]">“Can we add a grace period of at least 5 days before any late fee applies?”</p>
          </Story>
        </ol>
      </div>
    </section>
  )
}
function Story({ n, title, icon, children }: { n: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <li className="story paper p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-subtle bg-bg">{icon}</span>
        <span className="font-mono text-xs text-text-secondary">{n}</span>
      </div>
      <h3 className="mt-5 font-serif text-[1.7rem] leading-tight font-medium tracking-tight">{title}</h3>
      <div className="mt-2 text-text-secondary">{children}</div>
    </li>
  )
}

/* ---------- Hybrid AI: flow diagram ---------- */
function Hybrid({ avail }: { avail: DeviceAvailability | 'checking' }) {
  return (
    <section id="hybrid" className="border-t border-border-subtle py-24 sm:py-36" aria-labelledby="hybrid-title">
      <p className="eyebrow">Hybrid AI · Firebase AI Logic</p>
      <h2 id="hybrid-title" className="lp-h2 mt-4 max-w-[20ch]">On your device first. The cloud only with consent.</h2>
      <div className="flow mt-14" role="img" aria-label="Flow: the lease is read by Gemini Nano on your device; if Nano is not available, Portia asks before using cloud Gemini; only the approved JSON goes to the cloud check.">
        <FlowNode k="Your lease" t="Text or page photos" />
        <FlowEdge />
        <div className="flex flex-col gap-3">
          <FlowNode k="ON_DEVICE" t="Gemini Nano in Chrome" accent />
          <div className="flow-alt">
            <span className="font-mono text-[0.65rem] text-text-secondary">No Nano? Portia asks first</span>
            <FlowNode k="IN_CLOUD" t="Cloud Gemini, with consent" dashed />
          </div>
        </div>
        <FlowEdge />
        <FlowNode k="You approve" t="Structured JSON only" />
        <FlowEdge />
        <FlowNode k="IN_CLOUD" t="Check against the playbook" />
      </div>
      <p className="mt-12 flex max-w-3xl items-start gap-3 rounded-xl border border-border-subtle bg-surface px-4 py-3 text-sm" data-testid="landing-device">
        <span className="eyebrow mt-0.5 shrink-0">This device</span>
        <span>{heroLine(avail)}</span>
      </p>
    </section>
  )
}
function FlowNode({ k, t, accent, dashed }: { k: string; t: string; accent?: boolean; dashed?: boolean }) {
  return (
    <div className={`flow-node rounded-xl border p-4 ${accent ? 'border-accent bg-accent text-on-accent' : dashed ? 'border-dashed border-border bg-bg' : 'border-border-subtle bg-surface'}`}>
      <p className={`font-mono text-[0.68rem] tracking-[0.06em] ${accent ? '' : 'text-text-secondary'}`}>{k}</p>
      <p className="mt-1 font-serif text-[1.1rem] leading-snug font-medium">{t}</p>
    </div>
  )
}
function FlowEdge() {
  return <div className="flow-edge" aria-hidden="true"><span /></div>
}

/* ---------- Privacy: Vercel-style grid with crosshairs ---------- */
function PrivacyGrid() {
  const facts: [string, string][] = [
    ['No account', 'A client-only web app with no server or database of its own.'],
    ['Consent per document', 'Cloud consent covers the current document and resets when it changes.'],
    ['Approved JSON only', 'The check request carries playbook rules and your approved map, never the lease.'],
    ['Off by default', 'Remembering your last extract is opt-in. Lease text and photos are never stored.'],
    ['See what was sent', 'The results screen shows the exact text sent to the check model.'],
    ['No analytics, no ads', 'Requests to Firebase AI Logic are protected by App Check.'],
  ]
  return (
    <section id="privacy" className="border-t border-border-subtle py-24 sm:py-36" aria-labelledby="privacy-title">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Privacy and consent</p>
          <h2 id="privacy-title" className="lp-h2 mt-4 max-w-[16ch]">Your lease stays in your hands.</h2>
        </div>
        <a href="/privacy" onClick={(e) => { e.preventDefault(); navigate('privacy') }}>Read how your data flows</a>
      </div>
      <ul className="xgrid mt-12 grid sm:grid-cols-2 lg:grid-cols-3">
        {facts.map(([t, d]) => (
          <li key={t} className="xcell p-6 sm:p-8">
            <p className="font-serif text-[1.35rem] font-medium tracking-tight">{t}</p>
            <p className="mt-2 text-text-secondary">{d}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ---------- Sample verdict ---------- */
type S = { pb: { id: string }; rules: { key: string; status: Status; title: string }[]; rent: number; fees: number; red: number; amber: number; green: number }
function Sample({ s, money }: { s: S; money: (v: number) => string }) {
  return (
    <section id="sample" className="border-t border-border-subtle py-24 sm:py-36" aria-labelledby="sample-title">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="eyebrow">Sample verdict</p>
          <h2 id="sample-title" className="lp-h2 mt-4">What you get back.</h2>
          <p className="mt-5 text-text-secondary">
            Sample lease (fictional: Unit 4B, Maple Court Residences), checked against <span className="font-mono text-sm">{s.pb.id}</span>.
            Computed in your browser from the bundled sample extract with the same rules the tool runs.
          </p>
          <AppLink className="btn btn-primary mt-8">Check your own lease</AppLink>
        </div>
        <div className="paper overflow-hidden p-4 sm:p-6 lg:col-span-8" data-testid="landing-sample">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="cost-band flex flex-col justify-between gap-3 p-5">
              <p className="muted font-mono text-[0.62rem] uppercase tracking-[0.1em]">True monthly cost · sample lease</p>
              <p>
                <strong className="cost-figure block text-[2.8rem] sm:text-[3.4rem]" data-testid="landing-monthly">{money(s.rent + s.fees)}</strong>
                <span className="muted mt-2 block font-mono text-[0.72rem]">({money(s.rent)} rent + {money(s.fees)} required fees)</span>
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2" data-testid="landing-counts">
              {(['RED', 'AMBER', 'GREEN'] as Status[]).map((st) => (
                <div key={st} className="flex flex-col items-start justify-between gap-3 rounded-xl border border-border bg-bg p-3">
                  <StatusPill status={st} compact />
                  <span className={`font-mono text-[2.2rem] leading-none font-medium ${st === 'RED' ? 'text-red-text' : st === 'AMBER' ? 'text-amber-text' : 'text-green-text'}`} data-testid={`landing-count-${st}`}>
                    {st === 'RED' ? s.red : st === 'AMBER' ? s.amber : s.green}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <ol className="mt-5 divide-y divide-border-subtle border-t border-border-subtle">
            {s.rules.map((f, i) => (
              <li key={f.key} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="w-6 font-mono text-[0.68rem] text-text-secondary">{String(i + 1).padStart(2, '0')}</span>
                <StatusPill status={f.status} compact />
                <span className="font-serif text-[1rem]">{f.title}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

/* ---------- FAQ ---------- */
function Faq() {
  const qa: [string, ReactNode][] = [
    ['Is this legal advice?', 'No. Portia flags patterns from a curated, static playbook. It does not know the law where you live and cannot tell you whether a term is enforceable. Check with a local tenant union, legal aid service or lawyer before relying on any flag.'],
    ['Which places does it cover?', `${PLAYBOOKS.length} playbooks: ${PLAYBOOKS.map((p) => p.jurisdiction).join('; ')}.`],
    ['What can I upload?', 'Pasted text, or JPEG and PNG photos of each page, up to 3 pages per extract with more added in batches. PDFs are not accepted: export or photograph each page.'],
    ['What if my browser does not have Gemini Nano?', 'Portia tells you, and offers cloud Gemini through Firebase AI Logic with your consent for that document. Nothing is sent before you agree.'],
    ['Do I need an account?', 'No. There is no sign-up, and nothing is stored unless you turn on "remember".'],
    ['What do red, amber and green mean?', 'Red means "likely worth pushing back on before signing", amber means "ask about this", green means "looks typical". Counts come from the playbook rules, not from the model.'],
  ]
  return (
    <section id="faq" className="border-t border-border-subtle py-24 sm:py-36" aria-labelledby="faq-title">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="eyebrow">FAQ</p>
          <h2 id="faq-title" className="lp-h2 mt-4">Plain answers.</h2>
        </div>
        <div className="divide-y divide-border-subtle border-y border-border-subtle lg:col-span-8">
          {qa.map(([q, a]) => (
            <details key={q} className="faq py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-serif text-[1.3rem] font-medium tracking-tight">
                {q}
                <span className="faq-plus font-mono text-lg text-text-secondary" aria-hidden="true">+</span>
              </summary>
              <p className="mt-3 max-w-[64ch] text-text-secondary">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------- Closing CTA ---------- */
function Closing() {
  return (
    <section className="bleed ink-band" aria-labelledby="final-title">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-10 px-4 py-24 sm:px-6 sm:py-36 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <LogoMark size={56} />
          <h2 id="final-title" className="lp-statement mt-8 max-w-[14ch]">
            Know the real number <em>before</em> you sign.
          </h2>
        </div>
        <AppLink className="btn btn-primary btn-lg lp-cta">
          Check a lease <span aria-hidden="true" className="lp-arrow">→</span>
        </AppLink>
      </div>
    </section>
  )
}
