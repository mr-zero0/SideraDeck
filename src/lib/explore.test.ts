import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Body, HelioVector, Illumination } from 'astronomy-engine'
import { Vector3 } from 'three'
import { galaxiesConfig, getBody, sceneConfig } from '../config'
import { SpacecraftDataSchema } from '../schemas/explore'
import { GALACTIC_CENTER_EQJ, eqjToEcl, type Vec3 } from './frames'
import { galaxyFrame, milkyWayFrame } from './galaxy'
import { angularDiameterRad, limitingMagnitude, observe, starApparentMagnitude } from './photometry'
import { craftPositionAu, craftRadiusUnits } from './spacecraft'
import { elevationOf, rotateLook, standingNormal } from './vantage'

const helio = (b: Body, d: Date): Vec3 => {
  const v = HelioVector(b, d)
  return [v.x, v.y, v.z]
}
const DEG = Math.PI / 180

describe('photometry', () => {
  // Lambert phase law vs astronomy-engine's empirical model: tight when gibbous, looser as a crescent.
  it.each([
    ['2026-01-15', 0.4],
    ['2026-08-10', 0.4],
    ['2025-03-01', 1.0],
  ])('matches astronomy-engine for Venus seen from Earth on %s', (iso, tolerance) => {
    const d = new Date(`${iso}T00:00:00Z`)
    const o = observe(getBody('venus'), helio(Body.Venus, d), helio(Body.Earth, d))
    expect(o.magnitude).not.toBeNull()
    expect(Math.abs((o.magnitude ?? 0) - Illumination(Body.Venus, d).mag)).toBeLessThan(tolerance)
  })

  it('shows Earth from Mars as a bright point a few arcseconds wide', () => {
    const d = new Date('2026-11-23T00:00:00Z')
    const o = observe(getBody('earth'), helio(Body.Earth, d), helio(Body.Mars, d))
    expect(o.angularDiameterArcsec).toBeGreaterThan(5)
    expect(o.angularDiameterArcsec).toBeLessThan(60)
    expect(o.magnitude).toBeGreaterThan(-3.5)
    expect(o.magnitude).toBeLessThan(2)
  })

  it('gives the Moon a half-degree disc from Earth and the Sun magnitude 0.5 from Alpha Centauri', () => {
    expect(angularDiameterRad(1737.4, 384_400) / DEG).toBeCloseTo(0.518, 2)
    expect(starApparentMagnitude(4.85, 1.3248)).toBeCloseTo(0.46, 1)
  })

  it('reaches fainter stars with magnification', () => {
    expect(limitingMagnitude(sceneConfig.optics.eyeFovDeg, sceneConfig.optics)).toBe(sceneConfig.optics.eyeLimitingMagnitude)
    expect(limitingMagnitude(sceneConfig.optics.eyeFovDeg / 10, sceneConfig.optics)).toBeCloseTo(sceneConfig.optics.eyeLimitingMagnitude + 5, 9)
  })
})

describe('first-person vantage', () => {
  const target = new Vector3(1, 0.2, 0).normalize()
  const sun = new Vector3(1, 0, 0.4).normalize()
  const up = standingNormal(target, sun, 25 * DEG, 6 * DEG)

  it('puts a target far from the Sun at the requested elevation, Sun set', () => {
    const farSun = new Vector3(-0.2, 0, 1).normalize()
    const n = standingNormal(target, farSun, 25 * DEG, 6 * DEG)
    expect(elevationOf(target, n) / DEG).toBeCloseTo(25, 6)
    expect(elevationOf(farSun, n)).toBeLessThan(0)
  })

  it('stands in twilight: Sun 6 degrees down, target as high as the geometry allows', () => {
    const elongation = target.angleTo(sun)
    expect(elevationOf(sun, up) / DEG).toBeCloseTo(-6, 6)
    expect(elevationOf(target, up)).toBeCloseTo(elongation - 6 * DEG, 6)
  })

  it('splits the horizon when the target hugs the Sun', () => {
    const nearSun = sun.clone().add(new Vector3(0.05, 0, 0)).normalize()
    const n = standingNormal(nearSun, sun, 25 * DEG, 6 * DEG)
    const e = nearSun.angleTo(sun)
    expect(elevationOf(nearSun, n)).toBeCloseTo(e / 2, 6)
    expect(elevationOf(sun, n)).toBeCloseTo(-e / 2, 6)
  })

  it('survives a target exactly opposite the Sun', () => {
    expect(Number.isFinite(standingNormal(target, target.clone().negate(), 25 * DEG, 6 * DEG).x)).toBe(true)
  })

  it('clamps pitch and keeps elevation under pure yaw', () => {
    const look = new Vector3(0, 0, -1)
    const zenith = new Vector3(0, 1, 0)
    rotateLook(look, zenith, 0, 3, 80 * DEG)
    expect(elevationOf(look, zenith) / DEG).toBeCloseTo(80, 6)
    rotateLook(look, zenith, 1.2, 0, 80 * DEG)
    expect(elevationOf(look, zenith) / DEG).toBeCloseTo(80, 6)
  })
})

describe('spacecraft trajectories', () => {
  const data = SpacecraftDataSchema.parse(JSON.parse(readFileSync('public/data/spacecraft.json', 'utf8')))
  const track = (id: string) => {
    const t = data.craft.find((c) => c.id === id)
    if (!t) throw new Error(`no ${id}`)
    return t
  }
  const date = new Date('2026-06-01T00:00:00Z')

  it('places Voyager 1 beyond the heliopause', () => {
    const p = craftPositionAu(track('voyager-1'), date.getTime())
    if (!p) throw new Error('outside span')
    expect(Math.hypot(...p)).toBeGreaterThan(160)
    expect(Math.hypot(...p)).toBeLessThan(180)
  })

  it('keeps JWST near Sun-Earth L2, about 0.01 AU from Earth', () => {
    const jwst = craftPositionAu(track('jwst'), date.getTime())
    if (!jwst) throw new Error('outside span')
    const earth = eqjToEcl(helio(Body.Earth, date))
    const d = Math.hypot(jwst[0] - earth[0], jwst[1] - earth[1], jwst[2] - earth[2])
    expect(d).toBeGreaterThan(0.007)
    expect(d).toBeLessThan(0.014)
  })

  it('frames a modelled craft by half its real size and an unmodelled one by its marker', () => {
    const km = sceneConfig.scaleModes.true.unitsPerKm
    expect(craftRadiusUnits('jwst', 'true')).toBeCloseTo((21.2 / 2000) * km, 15)
    expect(craftRadiusUnits('new-horizons', 'true')).toBeCloseTo(sceneConfig.vantage.craftMarkerRadiusKm * km, 15)
  })

  it('returns null outside the fetched span', () => {
    expect(craftPositionAu(track('jwst'), Date.parse('2010-01-01'))).toBeNull()
  })
})

describe('galaxies', () => {
  it('orients each disc by its inclination and places it at its distance', () => {
    for (const g of galaxiesConfig.galaxies) {
      const f = galaxyFrame(g, galaxiesConfig.unitsPerKpc)
      const los = f.position.clone().normalize()
      expect(f.normal.dot(f.major)).toBeCloseTo(0, 9)
      expect(f.normal.angleTo(los) / DEG).toBeCloseTo(g.inclinationDeg, 6)
      expect(f.position.length()).toBeCloseTo(g.distanceKpc * galaxiesConfig.unitsPerKpc, 6)
    }
  })

  it('puts the galactic centre 5.6 degrees south of the ecliptic, 8.18 kpc away', () => {
    const [, , z] = eqjToEcl(GALACTIC_CENTER_EQJ)
    expect((Math.asin(z) * 180) / Math.PI).toBeCloseTo(-5.6, 0)
    expect(milkyWayFrame(galaxiesConfig.milkyWay.sunToCenterKpc, 1).position.length()).toBeCloseTo(8.18, 6)
  })
})
