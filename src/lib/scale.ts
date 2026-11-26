import { KM_PER_AU } from 'astronomy-engine'
import type { ScaleMode, SceneConfig } from '../schemas/scene'
import type { Vec3 } from './frames'

export function scaleDistanceAu(au: number, mode: ScaleMode, cfg: SceneConfig): number {
  if (mode === 'true') return au * KM_PER_AU * cfg.scaleModes.true.unitsPerKm
  const d = cfg.scaleModes.navigable.distance
  return d.unitsPerAuPow * au ** d.exponent
}

export function scaleRadiusKm(km: number, mode: ScaleMode, cfg: SceneConfig): number {
  if (mode === 'true') return km * cfg.scaleModes.true.unitsPerKm
  const r = cfg.scaleModes.navigable.radius
  return r.unitsPerKmPow * km ** r.exponent
}

/** Rescales a vector's length (AU) to scene units while keeping its direction. */
export function scaleVector(v: readonly [number, number, number], mode: ScaleMode, cfg: SceneConfig): Vec3 {
  const au = Math.hypot(v[0], v[1], v[2])
  if (au === 0) return [0, 0, 0]
  const k = scaleDistanceAu(au, mode, cfg) / au
  return [v[0] * k, v[1] * k, v[2] * k]
}
