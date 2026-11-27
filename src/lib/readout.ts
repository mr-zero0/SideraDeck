import { getBody, rootBody } from '../config'
import type { Vec3 } from './frames'
import { observe, type Observation } from './photometry'
import { helioEclAu } from './observer'
import type { CraftTrack } from './spacecraft'

/** Human eye resolves about 1 arcminute: a disc becomes visible once magnified to that size. */
export const EYE_RESOLUTION_ARCSEC = 60

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const angle = (a: Vec3, b: Vec3) =>
  Math.acos(Math.min(1, Math.max(-1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b)))))

export type Readout = Observation & {
  /** Angle between the target and the Sun as seen by the observer. */
  sunSeparationDeg: number
  /** Magnification at which the disc first looks like a disc rather than a point. */
  discAtMagnification: number
}

/** Telescope readout for a body seen from any heliocentric observer (ecliptic AU). */
export function readout(targetId: string, observerAu: Vec3, date: Date, tracks: readonly CraftTrack[] | null): Readout | null {
  if (targetId.startsWith('craft:')) return null
  const target = getBody(targetId)
  const targetAu = helioEclAu(targetId, date, tracks)
  if (!targetAu) return null
  const o = observe(target, targetAu, observerAu)
  const toTarget = sub(targetAu, observerAu)
  const toSun = sub([0, 0, 0], observerAu)
  return {
    ...o,
    sunSeparationDeg: target.id === rootBody.id ? 0 : (angle(toTarget, toSun) * 180) / Math.PI,
    discAtMagnification: Math.max(1, EYE_RESOLUTION_ARCSEC / o.angularDiameterArcsec),
  }
}
