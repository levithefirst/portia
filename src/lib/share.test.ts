import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SAMPLE_EXTRACT } from './judge'
import { getPlaybook } from './playbooks'
import { runPlaybook } from './rules'
import { MORE_NOTE, mailtoHref, shareText } from './share'

const LEASE = readFileSync(new URL('../../public/fixture-lease.txt', import.meta.url), 'utf8')
const questions = Array.from(
  new Set(runPlaybook(getPlaybook('us-typical'), SAMPLE_EXTRACT).filter((f) => f.status !== 'GREEN').map((f) => f.askTheLandlord)),
)

describe('share text for the landlord questions', () => {
  const text = shareText(questions, SAMPLE_EXTRACT)

  it('has the sample cost math from the rules', () => {
    expect(text).toContain('rent $1,850.00 + required fees $111.95 = $1,961.95')
    expect(text).toContain('Due at signing: $6,586.95.')
  })

  it('lists 9 or fewer numbered questions', () => {
    const n = text.split('\n').filter((l) => /^\d+\. /.test(l)).length
    expect(n).toBeGreaterThan(0)
    expect(n).toBeLessThanOrEqual(9)
  })

  it('has no em dash, no names and no lease text', () => {
    expect(text).not.toContain(String.fromCharCode(0x2014))
    expect(text).not.toMatch(/Jordan|Maple Court|Example Avenue/)
    expect(LEASE.includes(text.slice(0, 40))).toBe(false)
  })
})

describe('mailto link', () => {
  it('has no recipient, the subject, and stays under 2,000 characters', () => {
    const href = mailtoHref(questions, SAMPLE_EXTRACT)
    expect(href.startsWith('mailto:?subject=Questions%20about%20the%20lease%20before%20I%20sign&body=')).toBe(true)
    expect(href.length).toBeLessThan(2000)
  })

  it('trims questions and adds the printout note when the body would be too long', () => {
    const long = Array.from({ length: 9 }, (_, i) => `Question ${i + 1}: ${'please explain this clause in detail '.repeat(6)}`)
    const href = mailtoHref(long, SAMPLE_EXTRACT)
    const body = decodeURIComponent(href.split('&body=')[1])
    expect(encodeURIComponent(body).length).toBeLessThan(1800)
    expect(body).toContain(MORE_NOTE)
    expect(href.length).toBeLessThan(2000)
  })
})
