// Scores a results JSON downloaded from /eval?run=1 against the committed ground truth.
//
//   npm run eval:score -- path/to/results.json
//
// Prints the metrics and writes eval/results/summary-<date>-<ranOn>.json.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { summarize } from '../eval/score-lib.mjs'

const file = process.argv[2]
if (!file) {
  console.error('usage: npm run eval:score -- path/to/results.json')
  process.exit(1)
}
const results = JSON.parse(readFileSync(file, 'utf8'))
const truthById = {}
for (const split of ['dev', 'holdout']) {
  const dir = new URL(`../eval/fixtures/${split}/`, import.meta.url)
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(new URL(f, dir), 'utf8'))
    truthById[j.id] = j.truth
  }
}
const s = summarize(results, truthById)
const pct = (v) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`)
const msf = (v) => (v === null ? 'n/a' : `${Math.round(v)} ms`)
for (const [name, m] of [['overall', s.overall], ['dev', s.dev], ['holdout', s.holdout]]) {
  console.log(`\n${name}: ${m.scored}/${m.runs} scored, ${m.errors} errors`)
  console.log(`  fee recall            ${pct(m.feeRecall)} (${m.feesFound}/${m.feesPlanted})`)
  console.log(`  rent exact            ${pct(m.rentExact)}`)
  console.log(`  deposit exact         ${pct(m.depositExact)}`)
  console.log(`  late fee exact        ${pct(m.lateFeeExact)}`)
  console.log(`  monthly fees exact    ${pct(m.monthlyFeesExact)}`)
  console.log(`  true monthly exact    ${pct(m.trueMonthlyExact)}`)
  console.log(`  extract latency       median ${msf(m.medianExtractMs)}, p90 ${msf(m.p90ExtractMs)}`)
  console.log(`  ran on                ON_DEVICE ${pct(m.onDeviceShare)}, IN_CLOUD ${pct(m.inCloudShare)}`)
}
const day = String(s.date ?? new Date().toISOString()).slice(0, 10)
const out = new URL(`../eval/results/summary-${day}-${s.ranOn}.json`, import.meta.url)
writeFileSync(out, JSON.stringify({ ...s, sourceFile: file.split('/').pop() }, null, 2) + '\n')
console.log(`\nwrote ${out.pathname}`)
