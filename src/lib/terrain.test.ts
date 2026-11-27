import { describe, expect, it } from 'vitest'
import { sceneConfig } from '../config'
import { hash2, terrainGlsl, terrainHeightM, valueNoise } from './terrain'

const octaves = sceneConfig.vantage.terrain.octaves
const maxHeight = octaves.reduce((s, o) => s + o.amplitudeM, 0)

describe('terrain noise', () => {
  it('hashes deterministically into [0, 1], including negative lattice points', () => {
    expect(hash2(3, -7)).toBe(hash2(3, -7))
    for (let i = -50; i < 50; i++) {
      const h = hash2(i, i * 31)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(1)
    }
  })

  it('interpolates exactly through lattice values', () => {
    expect(valueNoise(4, -9)).toBe(hash2(4, -9))
  })

  it('keeps the ground at or above the reference sphere and within the summed amplitudes', () => {
    for (let i = 0; i < 500; i++) {
      const h = terrainHeightM(i * 37.3 - 9000, i * -11.9 + 4000, octaves)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(maxHeight)
    }
  })

  it('is continuous: a 1 cm step changes height by far less than eye height', () => {
    const a = terrainHeightM(1234.5, -876.5, octaves)
    const b = terrainHeightM(1234.51, -876.5, octaves)
    expect(Math.abs(a - b)).toBeLessThan(0.01)
  })

  it('emits GLSL with one term per configured octave', () => {
    expect(terrainGlsl(octaves).match(/h \+= /g)).toHaveLength(octaves.length)
  })
})
