import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { AiEngine } from './engine'
import { toSourceLabel } from './engine'
import { REJECT_MESSAGE, sortFiles } from './intake'
import { getPlaybook } from './playbooks'
import {
  cleanExtract,
  ConsentRequiredError,
  mergeExtracts,
  mergeFindings,
  parseExtract,
  parseFindings,
  ParseError,
  runCheck,
  runExtract,
} from './pipeline'
import { runPlaybook } from './rules'
import sample from '../fixtures/sample-extract.json'
import type { LeaseExtract } from './types'

const LEASE = readFileSync(new URL('../../public/fixture-lease.txt', import.meta.url), 'utf8')

function engine(onDevice: boolean): AiEngine & { extract: ReturnType<typeof vi.fn>; check: ReturnType<typeof vi.fn> } {
  return {
    kind: 'fake',
    availability: async () => (onDevice ? 'available' : 'unsupported'),
    prepareDevice: async () => {},
    willRunOnDevice: async () => onDevice,
    extract: vi.fn(async () => ({ text: JSON.stringify(sample), source: onDevice ? 'ON_DEVICE' : 'IN_CLOUD' })),
    check: vi.fn(async () => ({ text: '[]', source: 'IN_CLOUD' })),
  } as never
}

describe('privacy gate', () => {
  it('refuses to call the model when on-device is not ready and there is no consent', async () => {
    const e = engine(false)
    await expect(runExtract(e, { leaseText: LEASE, images: [], cloudConsent: false })).rejects.toBeInstanceOf(ConsentRequiredError)
    expect(e.extract).not.toHaveBeenCalled()
  })

  it('calls the cloud only after consent', async () => {
    const e = engine(false)
    const out = await runExtract(e, { leaseText: LEASE, images: [], cloudConsent: true })
    expect(e.extract).toHaveBeenCalledOnce()
    expect(out.source).toBe('IN_CLOUD')
  })

  it('runs without consent when the request will run on-device', async () => {
    const e = engine(true)
    const out = await runExtract(e, { leaseText: LEASE, images: [], cloudConsent: false })
    expect(out.source).toBe('ON_DEVICE')
    expect(out.extract.rentAmount).toBe(1850)
  })
})

describe('check payload', () => {
  it('contains the approved JSON and never the lease text', async () => {
    const e = engine(false)
    const approved = cleanExtract(sample as LeaseExtract)
    await runCheck(e, approved, getPlaybook('us-typical'), ['depositAmount'])
    const prompt = e.check.mock.calls[0][0] as string
    expect(prompt).toContain(JSON.stringify(approved))
    expect(prompt).not.toContain('RESIDENTIAL LEASE AGREEMENT')
    expect(prompt).not.toContain('Maple Court')
    expect(prompt).not.toContain('Jordan Sample')
    expect(e.check.mock.calls[0]).toHaveLength(1) // a single string, no image parts
  })
})

describe('parsing', () => {
  it('parses and normalises an extract', () => {
    const x = parseExtract('```json\n{"rentAmount":"$1,850","autoRenewal":"true","junk":1,"mandatoryFees":[{"name":"Tech","amount":"45"}]}\n```')
    expect(x).toEqual({ rentAmount: 1850, autoRenewal: 'yes', mandatoryFees: [{ name: 'Tech', amount: 45, frequency: undefined }] })
  })

  it('throws a visible ParseError on invalid JSON', () => {
    expect(() => parseExtract('not json')).toThrow(ParseError)
  })

  it('caps uncited RED findings at AMBER', () => {
    const f = parseFindings(
      JSON.stringify([
        { field: 'x', status: 'RED', title: 't', reason: 'r', askTheLandlord: 'q', playbookId: 'invented' },
        { field: 'lateFeeAmount', status: 'RED', title: 't', reason: 'r', askTheLandlord: 'q', playbookId: 'US-LATE-01' },
      ]),
      getPlaybook('us-typical'),
    )
    expect(f[0]).toMatchObject({ status: 'AMBER', downgraded: true, cited: false, playbookId: 'none' })
    expect(f[1]).toMatchObject({ status: 'RED', cited: true })
  })

  it('maps SDK inferenceSource values to badge labels', () => {
    expect(toSourceLabel('on_device')).toBe('ON_DEVICE')
    expect(toSourceLabel('in_cloud')).toBe('IN_CLOUD')
  })
})

describe('intake', () => {
  it('accepts PDFs and JPEG/PNG, rejects other types with the standard message', () => {
    const v = sortFiles([
      new File(['%PDF'], 'lease.pdf', { type: 'application/pdf' }),
      new File(['%PDF'], 'scan.PDF', { type: '' }),
      new File(['x'], 'p1.jpg', { type: 'image/jpeg' }),
      new File(['x'], 'p2.png', { type: 'image/png' }),
      new File(['x'], 'p3.heic', { type: 'image/heic' }),
      new File(['x'], 'lease.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    ])
    expect(v.pdfs.map((f) => f.name)).toEqual(['lease.pdf', 'scan.PDF'])
    expect(v.accepted.map((f) => f.name)).toEqual(['p1.jpg', 'p2.png'])
    expect(v.rejected.map((r) => r.name)).toEqual(['p3.heic', 'lease.docx'])
    expect(v.rejected[1].reason).toBe(REJECT_MESSAGE)
  })
})

describe('batches and merging', () => {
  it('fills empty fields and appends fees from a second batch', () => {
    const m = mergeExtracts({ rentAmount: 1000, mandatoryFees: [{ name: 'A', amount: 1 }] }, { rentAmount: 999, depositAmount: 500, mandatoryFees: [{ name: 'B', amount: 2 }, { name: 'a', amount: 1 }] })
    expect(m.rentAmount).toBe(1000)
    expect(m.depositAmount).toBe(500)
    expect(m.mandatoryFees?.map((f) => f.name)).toEqual(['A', 'B'])
  })

  it('merges cloud notes into matching rule findings', () => {
    const rules = runPlaybook(getPlaybook('us-typical'), sample as LeaseExtract)
    const cloud = parseFindings(JSON.stringify([{ field: 'lateFeeAmount', status: 'AMBER', title: 't', reason: 'cloud says', askTheLandlord: 'q', playbookId: 'US-LATE-01' }]), getPlaybook('us-typical'))
    const merged = mergeFindings(rules, cloud)
    expect(merged).toHaveLength(rules.length)
    expect(merged.find((f) => f.playbookId === 'US-LATE-01')?.cloudNote).toBe('cloud says')
  })
})
