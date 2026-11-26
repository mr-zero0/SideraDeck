import { describe, expect, it } from 'vitest'
import { formatDistance, formatDuration } from './format'

describe('format', () => {
  it('shows lunar distances in km and planetary distances in AU', () => {
    expect(formatDistance(384_400)).toBe('384,400 km')
    expect(formatDistance(149_597_870.7)).toBe('1 AU')
  })

  it('formats light time across seconds, minutes and hours', () => {
    expect(formatDuration(1.28)).toBe('1.3 s')
    expect(formatDuration(499)).toBe('8 min 19 s')
    expect(formatDuration(4.1 * 3600)).toBe('4 h 6 min')
  })
})
