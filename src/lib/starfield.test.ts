import { describe, expect, it } from 'vitest'
import { sceneConfig } from '../config'
import { bvToTemperatureK, buildStarBuffers, temperatureToRgb } from './starfield'

describe('star colour', () => {
  it('gives the Sun (B-V 0.65) a photosphere temperature near 5800 K', () => {
    expect(Math.abs(bvToTemperatureK(0.65) - 5800)).toBeLessThan(150)
  })

  it('renders hot stars blue-white and cool stars orange', () => {
    const [hr, , hb] = temperatureToRgb(bvToTemperatureK(-0.3))
    const [cr, , cb] = temperatureToRgb(bvToTemperatureK(1.6))
    expect(hb).toBeGreaterThan(hr)
    expect(cr).toBeGreaterThan(cb)
  })
})

describe('buildStarBuffers', () => {
  const cfg = sceneConfig.starfield
  const catalog = {
    fields: ['x', 'y', 'z', 'absmag', 'ci'],
    names: { Sol: 0, Polaris: 1 },
    stars: [0, 0, 0, 4.85, 0.656, 0, 0, 133, -3.6, 0.64],
  }

  it('keeps true distances, absolute magnitudes and the name index', () => {
    const b = buildStarBuffers(catalog, cfg)
    expect(b.count).toBe(2)
    expect(Math.hypot(b.positions3d[3] ?? 0, b.positions3d[4] ?? 0, b.positions3d[5] ?? 0)).toBeCloseTo(133 * cfg.unitsPerParsec, 2)
    expect(b.absMags[1]).toBeCloseTo(-3.6, 5)
    expect(b.names.Polaris).toBe(1)
  })

  it('rejects a catalog with an unexpected column layout', () => {
    expect(() => buildStarBuffers({ fields: ['ra', 'dec'], names: {}, stars: [] }, cfg)).toThrow()
  })
})
