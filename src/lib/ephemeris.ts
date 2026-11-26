import { HelioVector, RotationAxis, type Body } from 'astronomy-engine'
import { Matrix4, Quaternion, Vector3 } from 'three'
import type { CelestialBody } from '../schemas/celestial'
import type { ScaleMode, SceneConfig } from '../schemas/scene'
import { eqjToScene, type Vec3 } from './frames'
import { scaleVector } from './scale'

const DEG = Math.PI / 180
const MS_PER_DAY = 86_400_000

export function helioEqjAu(body: Body, date: Date): Vec3 {
  const v = HelioVector(body, date)
  return [v.x, v.y, v.z]
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

/**
 * Scene-space position of every body. Each body is placed relative to its parent and only that
 * offset is rescaled, so moons stay near their planets in navigable mode.
 */
export function computeScenePositions(
  bodies: readonly CelestialBody[],
  date: Date,
  mode: ScaleMode,
  cfg: SceneConfig,
): Map<string, Vec3> {
  const byId = new Map(bodies.map((b) => [b.id, b]))
  const helio = new Map<string, Vec3>()
  const out = new Map<string, Vec3>()

  const helioOf = (b: CelestialBody): Vec3 => {
    const hit = helio.get(b.id)
    if (hit) return hit
    const v = helioEqjAu(b.ephemerisBody, date)
    helio.set(b.id, v)
    return v
  }

  const resolve = (b: CelestialBody): Vec3 => {
    const hit = out.get(b.id)
    if (hit) return hit
    const parent = b.parentId === null ? undefined : byId.get(b.parentId)
    const rel = parent ? sub(helioOf(b), helioOf(parent)) : helioOf(b)
    const offset = scaleVector(eqjToScene(rel), mode, cfg)
    const base: Vec3 = parent ? resolve(parent) : [0, 0, 0]
    const p: Vec3 = [base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]]
    out.set(b.id, p)
    return p
  }

  bodies.forEach(resolve)
  return out
}

const _n = new Vector3()
const _q = new Vector3()
const _p = new Vector3()
const _e = new Vector3()
const _m = new Matrix4()
const toScene = (v: Vector3) => v.set(...eqjToScene([v.x, v.y, v.z]))

/**
 * IAU pole + prime-meridian orientation. Local +Y is the north pole and local +X is longitude 0,
 * which matches the equirectangular UV layout of three's SphereGeometry.
 */
export function bodyOrientation(body: CelestialBody, date: Date, target = new Quaternion()): Quaternion {
  const axis = RotationAxis(body.ephemerisBody, date)
  _n.set(axis.north.x, axis.north.y, axis.north.z).normalize()
  // Ascending node of the body equator on the ICRF equator (RA = pole RA + 90 deg).
  _q.set(0, 0, 1).cross(_n).normalize()
  const w = axis.spin * DEG
  _p.copy(_q).multiplyScalar(Math.cos(w)).add(_e.copy(_n).cross(_q).multiplyScalar(Math.sin(w)))
  _e.copy(_n).cross(_p) // east at longitude 0
  toScene(_n)
  toScene(_p)
  toScene(_e).negate() // local +Z points west for a right-handed basis
  _m.makeBasis(_p, _n, _e)
  return target.setFromRotationMatrix(_m)
}

/** One full orbit of `body` around `parent`, centred on `date`, in scene axes and AU. */
export function sampleOrbitAu(body: CelestialBody, parent: CelestialBody, date: Date, samples: number): Vec3[] {
  const periodDays = body.telemetry.orbitalPeriodDays
  if (periodDays === null) return []
  const t0 = date.getTime()
  return Array.from({ length: samples }, (_, i) => {
    const t = new Date(t0 + (i / samples - 0.5) * periodDays * MS_PER_DAY)
    return eqjToScene(sub(helioEqjAu(body.ephemerisBody, t), helioEqjAu(parent.ephemerisBody, t)))
  })
}
