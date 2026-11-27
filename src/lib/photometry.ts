import { KM_PER_AU } from 'astronomy-engine'
import type { CelestialBody } from '../schemas/celestial'
import type { SceneConfig } from '../schemas/scene'
import type { Vec3 } from './frames'

// Physical constants.
/** Apparent V magnitude of the Sun seen from 1 AU. */
export const SUN_MAGNITUDE_AT_1AU = -26.74
/** Diameter/albedo/absolute-magnitude relation: D = 1329 km / sqrt(p) * 10^(-H/5). */
const H_RELATION_KM = 1329
const RAD_TO_ARCSEC = (180 / Math.PI) * 3600
// Lambert phase function reaches 0 at full phase-angle 180 deg; floor avoids log(0).
const MIN_PHASE_FACTOR = 1e-6

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2])

export const angularDiameterRad = (radiusKm: number, distanceKm: number) => 2 * Math.asin(Math.min(1, radiusKm / distanceKm))

/** Sun-body-observer angle: 0 = fully lit face toward the observer. */
export function phaseAngleRad(sunAu: Vec3, bodyAu: Vec3, observerAu: Vec3): number {
  const a = sub(sunAu, bodyAu)
  const b = sub(observerAu, bodyAu)
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (len(a) * len(b))
  return Math.acos(Math.min(1, Math.max(-1, c)))
}

export const illuminatedFraction = (phaseRad: number) => (1 + Math.cos(phaseRad)) / 2

export const absoluteMagnitude = (diameterKm: number, albedo: number) => 5 * Math.log10(H_RELATION_KM / (diameterKm * Math.sqrt(albedo)))

/** Lambert-sphere phase law: within ~0.4 mag of empirical laws when gibbous, ~1 mag for thin crescents. */
const lambertPhase = (a: number) => (Math.sin(a) + (Math.PI - a) * Math.cos(a)) / Math.PI

export const sunMagnitude = (distanceAu: number) => SUN_MAGNITUDE_AT_1AU + 5 * Math.log10(distanceAu)

export const starApparentMagnitude = (absMag: number, distancePc: number) => absMag + 5 * Math.log10(distancePc / 10)

/** Faintest star visible: magnification ~ FOV ratio and aperture ~ magnification (fixed exit pupil). */
export const limitingMagnitude = (fovDeg: number, optics: SceneConfig['optics']) =>
  optics.eyeLimitingMagnitude + 5 * Math.log10(Math.max(1, optics.eyeFovDeg / fovDeg))

export const magnification = (fovDeg: number, optics: SceneConfig['optics']) => optics.eyeFovDeg / fovDeg

export type Observation = {
  distanceKm: number
  angularDiameterArcsec: number
  magnitude: number | null
  illuminated: number
  phaseDeg: number
}

/** What an observer at `observerAu` sees of `target` (all heliocentric, same frame, Sun at origin). */
export function observe(target: CelestialBody, targetAu: Vec3, observerAu: Vec3): Observation {
  const distanceAu = len(sub(targetAu, observerAu))
  const distanceKm = distanceAu * KM_PER_AU
  const angularDiameterArcsec = angularDiameterRad(target.telemetry.radiusKm, distanceKm) * RAD_TO_ARCSEC
  const albedo = target.telemetry.geometricAlbedo
  if (albedo === null) {
    return { distanceKm, angularDiameterArcsec, magnitude: sunMagnitude(distanceAu), illuminated: 1, phaseDeg: 0 }
  }
  const alpha = phaseAngleRad([0, 0, 0], targetAu, observerAu)
  const h = absoluteMagnitude(target.telemetry.radiusKm * 2, albedo)
  const magnitude = h + 5 * Math.log10(len(targetAu) * distanceAu) - 2.5 * Math.log10(Math.max(lambertPhase(alpha), MIN_PHASE_FACTOR))
  return { distanceKm, angularDiameterArcsec, magnitude, illuminated: illuminatedFraction(alpha), phaseDeg: (alpha * 180) / Math.PI }
}
