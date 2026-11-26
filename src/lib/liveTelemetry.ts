import { Body, HelioVector, KM_PER_AU } from 'astronomy-engine'
import type { CelestialBody } from '../schemas/celestial'

const LIGHT_KM_PER_S = 299_792.458
// Half-window for the central-difference velocity estimate.
const VELOCITY_HALF_WINDOW_MS = 60_000

export type LiveTelemetry = {
  distanceFromSunKm: number
  /** null for Earth itself. */
  distanceFromEarthKm: number | null
  lightTimeFromEarthS: number | null
  heliocentricSpeedKms: number
}

const helioKm = (b: Body, t: Date): [number, number, number] => {
  const v = HelioVector(b, t)
  return [v.x * KM_PER_AU, v.y * KM_PER_AU, v.z * KM_PER_AU]
}
const dist = (a: number[], b: number[]) => Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0))

export function computeLiveTelemetry(body: CelestialBody, date: Date): LiveTelemetry {
  const p = helioKm(body.ephemerisBody, date)
  const isEarth = body.ephemerisBody === Body.Earth
  const earthDistance = isEarth ? null : dist(p, helioKm(Body.Earth, date))
  const before = helioKm(body.ephemerisBody, new Date(date.getTime() - VELOCITY_HALF_WINDOW_MS))
  const after = helioKm(body.ephemerisBody, new Date(date.getTime() + VELOCITY_HALF_WINDOW_MS))
  return {
    distanceFromSunKm: Math.hypot(...p),
    distanceFromEarthKm: earthDistance,
    lightTimeFromEarthS: earthDistance === null ? null : earthDistance / LIGHT_KM_PER_S,
    heliocentricSpeedKms: dist(after, before) / ((2 * VELOCITY_HALF_WINDOW_MS) / 1000),
  }
}
