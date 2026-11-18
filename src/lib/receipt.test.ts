import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getPlaybook } from './playbooks'
import { buildCheckPrompt, buildExtractPrompt } from './prompts'
import { checkStep, extractStep, leaseTextMatches, leaseTextSent, receiptHeadline, rulesStep, utf8Bytes } from './receipt'
import { SAMPLE_EXTRACT } from './judge'

const LEASE = readFileSync(new URL('../../public/fixture-lease.txt', import.meta.url), 'utf8')
const checkPrompt = buildCheckPrompt(SAMPLE_EXTRACT, getPlaybook('us-typical'), [])

describe('leaseTextSent', () => {
  it('is 0 when the payload shares no 40-character run with the lease', () => {
    expect(leaseTextSent(LEASE, JSON.stringify({ rentAmount: 1850, depositAmount: 4625 }))).toBe(0)
    expect(leaseTextSent(LEASE, buildCheckPrompt({ rentAmount: 1850, lateFeeAmount: 150 }, getPlaybook('us-typical'), []))).toBe(0)
  })

  it('measures the real sample check prompt honestly', () => {
    // The approved summary fields of the recorded sample copy three short lease phrases.
    // Measured value, not a target: see the Item 2 note in the PR.
    const m = leaseTextMatches(LEASE, checkPrompt)
    expect(m.chars).toBe(144)
    expect(m.phrases).toContain('except structural repairs to the roof and foundation.')
    expect(m.chars).toBeLessThan(LEASE.length / 10)
  })

  it('is above 0 when lease text is injected into the payload', () => {
    const injected = checkPrompt + '\n' + LEASE.slice(200, 900)
    expect(leaseTextSent(LEASE, injected)).toBeGreaterThan(600)
  })

  it('ignores whitespace differences', () => {
    const para = LEASE.slice(LEASE.indexOf('3. LATE CHARGES'), LEASE.indexOf('4. REQUIRED'))
    const squashed = para.replace(/\s+/g, '   \n\t')
    expect(leaseTextSent(LEASE, squashed)).toBeGreaterThan(200)
  })
})

describe('receipt rows and headline', () => {
  it('on-device extract with a clean payload says 0 characters', () => {
    const steps = [
      extractStep({ ranOn: 'ON_DEVICE', raw: 'on_device', ms: 900, prompt: buildExtractPrompt(LEASE, 0), leaseText: LEASE, images: [] }),
      rulesStep(1),
      checkStep({ ranOn: 'IN_CLOUD', raw: 'in_cloud', ms: 2000, prompt: '{"rentAmount":1850}' }),
    ]
    expect(steps[0].sentToCloud.kind).toBe('nothing')
    expect(steps[2].sentToCloud).toMatchObject({ kind: 'approved-json', bytes: utf8Bytes('{"rentAmount":1850}') })
    expect(receiptHeadline(steps, LEASE)).toMatchObject({ zero: true, text: '0 characters of lease text sent' })
  })

  it('never claims 0 when the sample summaries match lease wording', () => {
    const steps = [
      extractStep({ ranOn: 'ON_DEVICE', raw: 'on_device', ms: 900, prompt: '', leaseText: LEASE, images: [] }),
      checkStep({ ranOn: 'IN_CLOUD', raw: 'in_cloud', ms: 2000, prompt: checkPrompt }),
    ]
    const h = receiptHeadline(steps, LEASE)
    expect(h.zero).toBe(false)
    expect(h.text).toContain('The lease never left this device')
    expect(h.text).toContain('144 characters')
  })

  it('cloud extract after consent states what was sent', () => {
    const img = { type: 'inlineData' as const, inlineData: { data: 'QUJDRA==', mimeType: 'image/png' } }
    const steps = [extractStep({ ranOn: 'IN_CLOUD', raw: 'in_cloud', ms: 900, prompt: buildExtractPrompt(LEASE, 2), leaseText: LEASE, images: [img, img] })]
    expect(steps[0].sentToCloud).toMatchObject({ kind: 'lease-text-and-images', imageCount: 2, imageBytes: 8 })
    const h = receiptHeadline(steps, LEASE)
    expect(h.zero).toBe(false)
    expect(h.text).toMatch(/^Lease text sent to cloud Gemini with your consent: [\d,]+ characters, 2 images\.$/)
  })

  it('cached and rules-only checks send nothing', () => {
    expect(checkStep({ ranOn: 'CACHED', ms: 8000, prompt: 'x' }).sentToCloud.kind).toBe('nothing')
    expect(checkStep({ ranOn: 'RULES_ONLY', ms: 1, prompt: 'x' }).sentToCloud.kind).toBe('nothing')
  })

  it('an unknown extract never claims 0', () => {
    expect(receiptHeadline([rulesStep(1)], LEASE).zero).toBe(false)
  })
})
