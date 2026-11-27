import { readFileSync } from 'node:fs'
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { exoplanetsConfig, getExoplanet, starVantages } from '../config'
import { hostEquatorialPc } from './exoplanet'
import { exoplanetStanding } from './vantage'

const catalog = JSON.parse(readFileSync('public/data/hyg_stars.json', 'utf8')) as { names: Record<string, number>; stars: number[] }
const DEG = Math.PI / 180
const elevation = (dir: Vector3, up: Vector3) => Math.asin(dir.dot(up)) / DEG

describe('exoplanets', () => {
  it('Proxima from the archive RA/Dec/distance lands on HYG Proxima Centauri (within 0.01 pc)', () => {
    const i = catalog.names['Proxima Centauri'] ?? -1
    const hyg = catalog.stars.slice(i * 5, i * 5 + 3)
    const p = hostEquatorialPc(getExoplanet('proxima-b')?.host ?? exoplanetsConfig.planets[0]!.host)
    expect(Math.hypot(p[0] - (hyg[0] ?? 0), p[1] - (hyg[1] ?? 0), p[2] - (hyg[2] ?? 0))).toBeLessThan(0.01)
  })

  it('stands so the Sun and the host star are both where the view config says', () => {
    const sun = new Vector3(0.3, -0.5, 0.8).normalize()
    const up = new Vector3()
    const host = new Vector3()
    exoplanetStanding(sun, exoplanetsConfig.view, up, host)
    expect(elevation(sun, up)).toBeCloseTo(exoplanetsConfig.view.solElevationDeg, 4)
    expect(elevation(host, up)).toBeCloseTo(exoplanetsConfig.view.hostElevationDeg, 4)
    // Azimuth difference between the two, measured on the horizon.
    const flat = (d: Vector3) => d.clone().addScaledVector(up, -d.dot(up)).normalize()
    expect(flat(sun).angleTo(flat(host)) / DEG).toBeCloseTo(exoplanetsConfig.view.solAzimuthFromHostDeg, 4)
  })

  it('every host given a catalog name is in the shipped catalog', () => {
    for (const p of exoplanetsConfig.planets) if (p.host.hygName) expect(catalog.names[p.host.hygName]).toBeDefined()
  })

  it('ids never collide with star vantages (both live in one share-link namespace)', () => {
    const ids = [...starVantages.stars, ...exoplanetsConfig.planets].map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
