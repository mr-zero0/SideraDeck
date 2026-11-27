import { describe, expect, it } from 'vitest'
import { lightEchoesConfig } from '../config'
import { formatYear, lightEcho } from './lightEcho'

const NOW = new Date('2026-11-25T12:00:00Z')

describe('lightEcho', () => {
  it('Sirius (8.6 ly): light left in 2018, near the first gravitational-wave detection', () => {
    const e = lightEcho(8.6, NOW)
    expect(e.departYear).toBe(2018)
    expect(e.label).toBe('2018')
    expect(e.event?.year).toBe(2015)
  })

  it('Betelgeuse (~548 ly): rounds to the decade and finds the printing press', () => {
    const e = lightEcho(548, NOW)
    expect(e.label).toBe('1480')
    expect(e.event?.year).toBe(1440)
  })

  it('Deneb (~2600 ly): BCE years are labelled in the historian convention', () => {
    const e = lightEcho(2600, NOW)
    expect(e.label).toBe('600 BCE')
    expect(e.event?.year).toBe(-584)
  })

  it('no event is claimed when nothing falls inside the match window', () => {
    expect(lightEcho(0.0001, NOW).event).toBeNull()
  })

  it('beyond the earliest event it says before written history', () => {
    const e = lightEcho(2.5e6, NOW)
    expect(e.beforeHistory).toBe(true)
    expect(e.event).toBeNull()
  })

  it('formatYear handles year zero as 1 BCE', () => {
    expect(formatYear(0, 1)).toBe('1 BCE')
    expect(formatYear(-584, 1)).toBe('585 BCE')
  })

  it('every event cites a source', () => {
    expect(lightEchoesConfig.events.every((e) => e.source.startsWith('https://'))).toBe(true)
  })
})
