import { describe, expect, it } from 'vitest'
import { sceneConfig } from '../config'
import { anchorAt, simTimeMs } from './simClock'

describe('sim clock', () => {
  it('advances at the configured rate', () => {
    const c = anchorAt(Date.parse('2030-01-01T00:00:00Z'), 86_400, 1_000)
    // 2 real seconds at 1 day/s = 2 sim days.
    expect(simTimeMs(c, 3_000)).toBe(Date.parse('2030-01-03T00:00:00Z'))
  })

  it('stays continuous when re-anchored with a new rate', () => {
    const a = anchorAt(0, 3_600, 0)
    const at = simTimeMs(a, 5_000)
    const b = anchorAt(at, -3_600, 5_000)
    expect(simTimeMs(b, 5_000)).toBe(at)
    expect(simTimeMs(b, 6_000)).toBe(at - 3_600_000)
  })

  it('clamps to the supported date range', () => {
    const c = anchorAt(Date.parse(sceneConfig.time.maxDate), 2_592_000, 0)
    expect(simTimeMs(c, 60_000)).toBe(Date.parse(sceneConfig.time.maxDate))
  })
})
