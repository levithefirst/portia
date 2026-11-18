// Generates SYNTHETIC lease fixtures and their ground truth for the Portia eval.
//
//   node scripts/make-eval-fixtures.mjs <split> <seed> <count>
//
// Text and ground truth come from the same random parameters, so the answers
// are correct by construction. No real names, addresses or companies: every
// party, street and town below is invented. Each .txt starts with a SYNTHETIC
// banner and each .json has "synthetic": true.
import { mkdirSync, writeFileSync } from 'node:fs'

const [split, seedArg, countArg] = process.argv.slice(2)
if (!split || !seedArg || !countArg) {
  console.error('usage: node scripts/make-eval-fixtures.mjs <split> <seed> <count>')
  process.exit(1)
}

// mulberry32 seeded PRNG
let seed = Number(seedArg) >>> 0
const rnd = () => {
  seed = (seed + 0x6d2b79f5) >>> 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1))
const pick = (xs) => xs[Math.floor(rnd() * xs.length)]
const step = (a, b, s) => a + s * int(0, Math.floor((b - a) / s))
const chance = (p) => rnd() < p
const shuffle = (xs) => xs.map((x) => [rnd(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1])
const r2 = (n) => Math.round(n * 100) / 100

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen']
const words = (n) => (n < WORDS.length ? `${WORDS[n]} (${n})` : `${n}`)

const STREETS = ['Lantern Row', 'Quarry Lane', 'Thistle Court', 'Marigold Way', 'Copperleaf Drive', 'Harbour View Close', 'Sable Street', 'Juniper Terrace']
const TOWNS_US = ['Brookhaven Falls', 'Ashford Mills', 'Pine Hollow', 'Cedar Bend']
const TOWNS_UK = ['Little Wexcombe', 'Hartwell-on-Sea', 'Brindlemoor', 'Upper Fenwick']
const TOWNS_NG = ['Ikota Gardens Estate', 'Palmgrove Close Estate', 'Adeniran Crescent Estate', 'Oduduwa View Estate']
const LANDLORDS = ['Sample Holdings LLC', 'Fictional Lettings Ltd', 'Placeholder Properties Ltd', 'Imaginary Estates Co.']
const TENANTS = ['Tenant A', 'Tenant B', 'The Tenant', 'Test Tenant']

function money(n, cur) {
  const sym = cur === 'USD' ? '$' : cur === 'GBP' ? '£' : 'N'
  const s = n.toLocaleString('en', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
  return cur === 'NGN' ? `${sym}${s}` : `${sym}${s}`
}

function makeUS() {
  const cur = 'USD'
  const rent = step(900, 3400, 25)
  const deposit = r2(rent * pick([1, 1.5, 2, 2.5]))
  const hasLate = chance(0.8)
  const late = hasLate ? step(40, 200, 5) : undefined
  const grace = hasLate ? pick([0, 0, 3, 5, 5, 10]) : undefined
  const notice = pick([30, 60, 60, 90])
  const auto = pick(['yes', 'yes', 'no'])
  const pool = [
    ['Technology Package', step(25, 60, 5), 'monthly'],
    ['Community Amenity Fee', step(20, 50, 5), 'monthly'],
    ['Valet Trash Service', step(15, 35, 5), 'monthly'],
    ['Pest Control Fee', step(5, 15, 1), 'monthly'],
    ['Utility Billing Administration Fee', pick([3.95, 4.95, 6.95, 9.95]), 'monthly'],
    ['Smart Home Fee', step(10, 30, 5), 'monthly'],
    ['Package Locker Fee', step(5, 20, 5), 'monthly'],
    ['Administrative Fee', step(150, 400, 25), 'one-time'],
    ['Lease Preparation Fee', step(50, 150, 5), 'one-time'],
    ['Move-In Fee', step(100, 300, 25), 'one-time'],
  ]
  const fees = shuffle(pool).slice(0, int(0, 5))
  return { cur, rentPeriod: 'monthly', rent, deposit, late, grace, notice, auto, fees, juris: 'US', towns: TOWNS_US }
}

function makeEW() {
  const cur = 'GBP'
  const rent = step(750, 2400, 25)
  const weeks = pick([5, 5, 5, 6])
  const deposit = r2(((rent * 12) / 52) * weeks)
  const hasLate = chance(0.5)
  const late = hasLate ? pick([25, 30, 50]) : undefined
  const grace = hasLate ? pick([7, 14]) : undefined
  const notice = pick([30, 30, 60])
  const auto = pick(['yes', 'no'])
  const pool = [
    ['Tenancy Administration Fee', step(150, 450, 25), 'one-time'],
    ['Inventory Check Fee', step(80, 200, 10), 'one-time'],
    ['Referencing Fee', step(40, 120, 10), 'one-time'],
    ['Monthly Service Charge', step(25, 90, 5), 'monthly'],
    ['Communal Cleaning Charge', step(10, 40, 5), 'monthly'],
  ]
  const fees = shuffle(pool).slice(0, int(0, 3))
  return { cur, rentPeriod: 'monthly', rent, deposit, late, grace, notice, auto, fees, juris: 'England & Wales', towns: TOWNS_UK }
}

function makeNG() {
  const cur = 'NGN'
  const rent = step(1200000, 6000000, 50000)
  const deposit = pick([r2(rent * 0.1), step(100000, 500000, 50000)])
  const hasLate = chance(0.25)
  const late = hasLate ? step(10000, 50000, 5000) : undefined
  const grace = hasLate ? pick([7, 14]) : undefined
  const notice = pick([90, 180, 180])
  const auto = pick(['yes', 'no', 'no'])
  const pool = [
    ['Agency Fee', r2(rent * 0.1), 'one-time'],
    ['Legal Fee', r2(rent * 0.1), 'one-time'],
    ['Service Charge', step(150000, 600000, 50000), 'yearly'],
    ['Development Levy', step(50000, 200000, 25000), 'one-time'],
  ]
  const fees = shuffle(pool).slice(0, int(1, 4))
  return { cur, rentPeriod: 'yearly', rent, deposit, late, grace, notice, auto, fees, juris: 'Lagos', towns: TOWNS_NG }
}

function feeLine(f, cur, style) {
  const [name, amt, freq] = f
  const when = freq === 'monthly' ? 'per month' : freq === 'yearly' ? 'per year' : 'once, at signing'
  if (style === 'list') return `   - ${name}: ${money(amt, cur)} ${when}`
  return `${name} of ${money(amt, cur)} ${when}`
}

function render(p, idx) {
  const style = pick(['clauses', 'schedule', 'prose'])
  const cur = p.cur
  const unit = `${int(1, 40)}${pick(['A', 'B', 'C', ''])}, ${int(10, 980)} ${pick(STREETS)}, ${pick(p.towns)}`
  const landlord = pick(LANDLORDS)
  const tenant = pick(TENANTS)
  const per = p.rentPeriod === 'yearly' ? 'per annum' : pick(['per month', 'per calendar month', 'monthly'])
  const lines = [`SYNTHETIC TEST LEASE ${idx}. Not a real agreement. All names and places are invented.`, '']
  const noticeText = p.notice % 30 === 0 && chance(0.5) ? `${words(p.notice / 30)} month${p.notice === 30 ? '' : 's'}` : `${words(p.notice)} days`
  const lateText = p.late === undefined
    ? 'No late charge applies to overdue rent.'
    : p.grace === 0
      ? `Rent not received by the due date is late, and a late charge of ${money(p.late, cur)} applies immediately.`
      : `If rent remains unpaid ${words(p.grace)} days after the due date, a late charge of ${money(p.late, cur)} applies.`
  const autoText = p.auto === 'yes'
    ? `This agreement renews automatically for a further term of the same length unless the Tenant gives written notice at least ${noticeText} before the end of the term.`
    : `This agreement ends on the last day of the term and does not renew automatically. The Tenant must give ${noticeText} written notice before leaving.`
  const feeIntro = p.fees.length
    ? `The following charges are mandatory and payable in addition to rent:`
    : `No charges are payable in addition to rent.`

  if (style === 'clauses') {
    lines.push(`${p.juris === 'US' ? 'RESIDENTIAL LEASE' : p.juris === 'Lagos' ? 'TENANCY AGREEMENT' : 'ASSURED SHORTHOLD TENANCY AGREEMENT'}`, '')
    lines.push(`Premises: ${unit}`, `Landlord: ${landlord}`, `Tenant: ${tenant}`, '')
    lines.push(`1. RENT. The Tenant shall pay rent of ${money(p.rent, cur)} ${per}.`)
    lines.push(`2. DEPOSIT. The Tenant shall pay a ${p.juris === 'Lagos' ? 'caution deposit' : 'security deposit'} of ${money(p.deposit, cur)} at signing.`)
    lines.push(`3. LATE PAYMENT. ${lateText}`)
    lines.push(`4. CHARGES. ${feeIntro}`)
    for (const f of p.fees) lines.push(feeLine(f, cur, 'list'))
    lines.push(`5. TERM AND RENEWAL. ${autoText}`)
    lines.push(`6. REPAIRS. The Landlord is responsible for structural repairs. The Tenant reports defects promptly.`)
  } else if (style === 'schedule') {
    lines.push('SCHEDULE OF TERMS', '')
    lines.push(`Property ............ ${unit}`)
    lines.push(`Landlord ............ ${landlord}`)
    lines.push(`Rent ................ ${money(p.rent, cur)} ${per}`)
    lines.push(`Deposit ............. ${money(p.deposit, cur)}`)
    lines.push(`Late payment ........ ${lateText}`)
    lines.push(`Renewal ............. ${autoText}`)
    lines.push('', `Additional charges. ${feeIntro}`)
    for (const f of p.fees) lines.push(feeLine(f, cur, 'list'))
  } else {
    lines.push(`This agreement is made between ${landlord} (the Landlord) and ${tenant} (the Tenant) for ${unit}.`, '')
    lines.push(`The rent is ${money(p.rent, cur)} ${per}, and the Tenant pays a deposit of ${money(p.deposit, cur)} when signing. ${lateText}`, '')
    if (p.fees.length) lines.push(`In addition to rent, the Tenant must pay a ${p.fees.map((f) => feeLine(f, cur, 'prose')).join(', a ')}. These charges are not optional.`, '')
    else lines.push(feeIntro, '')
    lines.push(autoText)
  }
  return lines.join('\n') + '\n'
}

function truth(p) {
  const t = {
    currency: p.cur,
    rentAmount: p.rent,
    rentPeriod: p.rentPeriod,
    depositAmount: p.deposit,
    noticePeriodDays: p.notice,
    autoRenewal: p.auto,
    mandatoryFees: p.fees.map(([name, amount, frequency]) => ({ name, amount, frequency })),
  }
  if (p.late !== undefined) {
    t.lateFeeAmount = p.late
    t.lateFeeGraceDays = p.grace
  }
  return t
}

const n = Number(countArg)
const dir = new URL(`../eval/fixtures/${split}/`, import.meta.url)
mkdirSync(dir, { recursive: true })
const makers = [makeUS, makeEW, makeNG]
for (let i = 1; i <= n; i++) {
  const p = makers[(i - 1) % 3]()
  const id = `${split}-${String(i).padStart(2, '0')}`
  writeFileSync(new URL(`${id}.txt`, dir), render(p, id))
  writeFileSync(
    new URL(`${id}.json`, dir),
    JSON.stringify({ synthetic: true, id, split, jurisdiction: p.juris, truth: truth(p) }, null, 2) + '\n',
  )
}
console.log(`wrote ${n} ${split} fixtures`)
