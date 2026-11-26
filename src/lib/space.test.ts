import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { registry, sceneConfig } from '../config'
import { OBLIQUITY_J2000_DEG, eclToScene, eqjToEcl } from './frames'
import { scaleDistanceAu, scaleRadiusKm, scaleVector } from './scale'
import { bodyOrientation, computeScenePositions, sampleOrbitAu } from './ephemeris'

const DEG = Math.PI / 180
const len = (v: readonly number[]) => Math.hypot(...v)
const body = (id: string) => {
  const b = registry.bodies.find((x) => x.id === id)
  if (!b) throw new Error(`missing ${id}`)
  return b
}

describe('frames', () => {
  it('rotates the celestial north pole into the ecliptic frame by the obliquity', () => {
    const [x, y, z] = eqjToEcl([0, 0, 1])
    expect(x).toBeCloseTo(0, 12)
    expect(y).toBeCloseTo(Math.sin(OBLIQUITY_J2000_DEG * DEG), 12)
    expect(z).toBeCloseTo(Math.cos(OBLIQUITY_J2000_DEG * DEG), 12)
  })

  it('maps ecliptic north to scene +Y and keeps a right-handed basis', () => {
    expect(eclToScene([0, 0, 1])).toEqual([0, 1, -0])
    const x = new Vector3(...eclToScene([1, 0, 0]))
    const y = new Vector3(...eclToScene([0, 1, 0]))
    const z = new Vector3(...eclToScene([0, 0, 1]))
    expect(x.clone().cross(y).distanceTo(z)).toBeCloseTo(0, 12)
  })
})

describe('scale', () => {
  it('compresses distance with a power law in navigable mode', () => {
    expect(scaleDistanceAu(1, 'navigable', sceneConfig)).toBeCloseTo(40, 9)
    expect(scaleDistanceAu(4, 'navigable', sceneConfig)).toBeCloseTo(80, 9)
  })

  it('keeps true proportions in true mode', () => {
    expect(scaleDistanceAu(1, 'true', sceneConfig)).toBeCloseTo(149.5978707, 6)
    expect(scaleRadiusKm(6378.1, 'true', sceneConfig)).toBeCloseTo(0.0063781, 9)
  })

  it('preserves direction and maps zero to zero', () => {
    const v = scaleVector([3, 4, 0], 'navigable', sceneConfig)
    expect(v[0] / v[1]).toBeCloseTo(0.75, 12)
    expect(len(v)).toBeCloseTo(scaleDistanceAu(5, 'navigable', sceneConfig), 9)
    expect(scaleVector([0, 0, 0], 'navigable', sceneConfig)).toEqual([0, 0, 0])
  })
})

describe('ephemeris', () => {
  // Earth perihelion 2025-01-04 13:28 UTC at 147,103,686 km (USNO / timeanddate).
  const perihelion = new Date('2025-01-04T13:28:00Z')

  it('places Earth at its published perihelion distance', () => {
    const pos = computeScenePositions(registry.bodies, perihelion, 'true', sceneConfig)
    const earth = pos.get('earth')
    if (!earth) throw new Error('no earth')
    const km = len(earth) / sceneConfig.scaleModes.true.unitsPerKm
    expect(Math.abs(km - 147_103_686)).toBeLessThan(20_000)
    // Earth lies on the ecliptic, which is the scene XZ plane.
    expect(Math.abs(earth[1]) / len(earth)).toBeLessThan(1e-4)
  })

  it('keeps the Sun at the origin and the Moon within its real distance range', () => {
    const pos = computeScenePositions(registry.bodies, perihelion, 'true', sceneConfig)
    expect(pos.get('sun')).toEqual([0, 0, 0])
    const e = pos.get('earth')
    const m = pos.get('moon')
    if (!e || !m) throw new Error('missing bodies')
    const km = len([m[0] - e[0], m[1] - e[1], m[2] - e[2]]) / sceneConfig.scaleModes.true.unitsPerKm
    expect(km).toBeGreaterThan(356_000)
    expect(km).toBeLessThan(407_000)
  })

  it('keeps the Moon clear of Earth in navigable mode', () => {
    const pos = computeScenePositions(registry.bodies, perihelion, 'navigable', sceneConfig)
    const e = pos.get('earth')
    const m = pos.get('moon')
    if (!e || !m) throw new Error('missing bodies')
    const gap = len([m[0] - e[0], m[1] - e[1], m[2] - e[2]])
    const clearance =
      scaleRadiusKm(body('earth').telemetry.radiusKm, 'navigable', sceneConfig) +
      scaleRadiusKm(body('moon').telemetry.radiusKm, 'navigable', sceneConfig)
    expect(gap).toBeGreaterThan(clearance * 2)
  })

  it("tilts Earth's spin axis 23.44 degrees from ecliptic north", () => {
    const q = bodyOrientation(body('earth'), perihelion)
    const pole = new Vector3(0, 1, 0).applyQuaternion(q)
    expect(pole.angleTo(new Vector3(0, 1, 0)) / DEG).toBeCloseTo(23.44, 1)
  })

  it('samples a closed orbit around the parent', () => {
    const pts = sampleOrbitAu(body('earth'), body('sun'), perihelion, 64)
    expect(pts).toHaveLength(64)
    const mean = pts.reduce((s, p) => s + len(p), 0) / pts.length
    expect(mean).toBeCloseTo(1, 1)
  })
})
