import type { ReactNode } from 'react'
import { IconChip, IconCloud, IconLock } from './icons'

/**
 * Landing hero. The copy is unchanged from the original (honest no-Nano line
 * comes from heroLine()); this file only owns layout and the lease specimen.
 */
export function Hero({ line, onDevice, run }: { line: string; onDevice: boolean; run?: ReactNode }) {
  return (
    <section className="hero grid gap-8 lg:grid-cols-12 lg:gap-10" aria-labelledby="hero-title">
      <div className="lg:col-span-7">
        <p className="eyebrow flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          Lease fee and obligation map
        </p>
        <h1 id="hero-title" className="display mt-4">
          <span className="reveal-line"><span>See what a lease</span></span>{' '}
          <span className="reveal-line"><span><em>really</em> costs before</span></span>{' '}
          <span className="reveal-line"><span>you sign.</span></span>
        </h1>
        <p className="mt-5 max-w-[60ch] text-[1.02rem] leading-relaxed text-text-secondary" data-testid="hero-line">
          {line}
        </p>
        {run}
        <ol className="steps mt-7 grid gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle sm:grid-cols-3" aria-label="How Portia works">
          <Step n="01" icon={<IconChip width={15} height={15} />} accent title="Extract on-device.">
            {onDevice ? 'Gemini Nano builds a JSON fee map.' : 'With Gemini Nano in desktop Chrome; here, cloud Gemini only with your consent.'}
          </Step>
          <Step n="02" icon={<IconLock width={15} height={15} />} title="You review and approve.">
            Edit anything; nothing leaves yet.
          </Step>
          <Step n="03" icon={<IconCloud width={15} height={15} />} title="Check in the cloud.">
            Only the approved JSON is scored red, amber, green.
          </Step>
        </ol>
      </div>
      <div className="hidden lg:col-span-5 lg:block">
        <LeaseSpecimen />
      </div>
    </section>
  )
}

function Step({ n, icon, title, children, accent = false }: { n: string; icon: ReactNode; title: string; children: ReactNode; accent?: boolean }) {
  return (
    <li className="flex gap-3 bg-surface p-3.5 text-sm sm:flex-col sm:gap-2 sm:p-4">
      <span className="flex items-center gap-2">
        <span
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${accent ? 'bg-accent text-on-accent' : 'border border-border-subtle bg-bg text-text'}`}
        >
          {icon}
        </span>
        <span className="hidden font-mono text-[0.7rem] text-text-secondary sm:inline">{n}</span>
      </span>
      <span className="leading-snug">
        <strong className="font-semibold">{title}</strong> <span className="text-text-secondary">{children}</span>
      </span>
    </li>
  )
}

/** Excerpt of the bundled sample lease (public/fixture-lease.txt) with the flags Portia raises on it. */
function LeaseSpecimen() {
  return (
    <figure className="specimen relative" aria-label="Excerpt from the bundled sample lease with the flags Portia raises">
      <div className="specimen-sheet paper relative overflow-hidden p-6 pb-16">
        <div className="flex items-baseline justify-between gap-3 border-b border-border-subtle pb-3">
          <p className="font-serif text-[0.95rem] font-medium tracking-wide">Residential Lease Agreement</p>
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.08em] text-text-secondary">Sample · Unit 4B</p>
        </div>
        <div className="mt-4 space-y-3.5 font-serif text-[0.92rem] leading-[1.55]">
          <p>
            <span className="clause-no">2.</span> Upon signing, Tenant shall pay a security deposit of{' '}
            <mark className="mk mk-red">$4,625.00 (two and one-half months of rent)</mark>.
          </p>
          <p>
            <span className="clause-no">3.</span> Rent not received by 11:59 p.m. on the 1st day of the month is late.{' '}
            <mark className="mk mk-red">Tenant shall pay an initial late charge of $150.00</mark>, plus $20.00 for each day thereafter.
          </p>
          <p>
            <span className="clause-no">4.</span> The following services are <mark className="mk mk-red">mandatory for all residents</mark>:
            Technology Package $45.00, Community Amenity Fee $35.00, Valet Trash $25.00, Utility Billing Administration $6.95 per month.
          </p>
          <p>
            <span className="clause-no">6.</span> This Lease shall <mark className="mk mk-amber">automatically renew</mark> unless Tenant delivers
            notice at least ninety (90) days before the end of the term.
          </p>
        </div>
        <div className="specimen-fade pointer-events-none absolute inset-x-0 bottom-0 h-14" aria-hidden="true" />
      </div>
      <div className="specimen-tag paper relative -mt-12 -ml-6 w-[17rem] p-4">
        <p className="eyebrow muted">True monthly cost, sample</p>
        <p className="mt-1 font-serif text-[2rem] leading-none font-medium tracking-tight">$1,961.95</p>
        <p className="muted mt-1.5 font-mono text-[0.7rem]">$1,850.00 rent + $111.95 required fees</p>
      </div>
      <figcaption className="sr-only">
        Clauses 2, 3 and 4 of the sample lease are flagged red, clause 6 amber. Required fees raise the monthly cost from $1,850.00 to
        $1,961.95.
      </figcaption>
    </figure>
  )
}
