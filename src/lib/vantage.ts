import { Vector3 } from 'three'

const _w = new Vector3()
const _neg = new Vector3()
const _right = new Vector3()
const _tmp = new Vector3()
const FALLBACK_AXES = [new Vector3(0, 1, 0), new Vector3(1, 0, 0)]
// Below this target-Sun separation there is no twilight geometry left; split the angle instead.
const MIN_TWILIGHT_ELEVATION_RAD = (2 * Math.PI) / 180

/**
 * Where to stand on a body so `targetDir` is above the horizon in twilight: the Sun sits
 * `sunDepthRad` below the horizon (sky glow, stars and planets visible) and the target, E radians
 * from the Sun, rises to E - sunDepth (capped at `maxElevationRad`). If the target is too close to
 * the Sun for that, target and Sun split the horizon symmetrically. Returns the surface normal.
 */
export function standingNormal(
  targetDir: Vector3,
  sunDir: Vector3,
  maxElevationRad: number,
  sunDepthRad: number,
  out = new Vector3(),
  togetherRad = 0,
): Vector3 {
  const elongation = targetDir.angleTo(sunDir)
  const twilight = elongation - sunDepthRad
  // Eclipses and transits: target and Sun are one spot in the sky, so raise both together.
  const elevationRad =
    elongation < togetherRad ? maxElevationRad : twilight >= MIN_TWILIGHT_ELEVATION_RAD ? Math.min(maxElevationRad, twilight) : elongation / 2
  _neg.copy(sunDir).negate()
  _w.copy(_neg).addScaledVector(targetDir, -_neg.dot(targetDir))
  for (const axis of FALLBACK_AXES) {
    if (_w.lengthSq() > 1e-10) break
    _w.copy(axis).addScaledVector(targetDir, -axis.dot(targetDir))
  }
  _w.normalize()
  return out.copy(targetDir).multiplyScalar(Math.sin(elevationRad)).addScaledVector(_w, Math.cos(elevationRad)).normalize()
}

/**
 * Body-fixed surface normal at a latitude / east longitude (degrees), in the frame CelestialBodyMesh
 * uses: +Y north pole, +X the prime meridian (IAU W = 0), east toward -Z.
 */
export function latLonToLocal(latDeg: number, lonDeg: number, out = new Vector3()): Vector3 {
  const lat = (latDeg * Math.PI) / 180
  const lon = (lonDeg * Math.PI) / 180
  return out.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon))
}

/** Angle above the local horizon (radians) of `dir` for an observer whose zenith is `up`. */
export const elevationOf = (dir: Vector3, up: Vector3) => Math.asin(Math.min(1, Math.max(-1, dir.dot(up))))

/** First-person look: yaw about the local zenith, pitch about the local right axis, pitch clamped. */
export function rotateLook(look: Vector3, up: Vector3, dYaw: number, dPitch: number, maxPitchRad: number): Vector3 {
  look.applyAxisAngle(up, dYaw)
  const pitch = elevationOf(look, up)
  const next = Math.min(maxPitchRad, Math.max(-maxPitchRad, pitch + dPitch))
  _right.crossVectors(look, up)
  if (_right.lengthSq() < 1e-12) return look
  _right.normalize()
  const d = next - pitch
  _tmp.crossVectors(_right, look)
  return look.multiplyScalar(Math.cos(d)).addScaledVector(_tmp, Math.sin(d)).normalize()
}

export type ExoplanetView = { hostElevationDeg: number; solElevationDeg: number; solAzimuthFromHostDeg: number }

const _q = new Vector3()
const _f = new Vector3()
const _r = new Vector3()
const DEG = Math.PI / 180

/**
 * Where to stand: the Sun's direction is fixed by where the system is, but the orbital phase and the
 * spot on a tidally locked planet are free. Choose them so the Sun stands at `solElevationDeg` and the
 * host at `hostElevationDeg`, `solAzimuthFromHostDeg` round the horizon from it. Writes `up` and `hostDir`.
 */
export function exoplanetStanding(sunDir: Vector3, view: ExoplanetView, up: Vector3, hostDir: Vector3): void {
  const eSol = view.solElevationDeg * DEG
  // Any direction perpendicular to the Sun completes the frame; pick one stable across frames.
  const axis = FALLBACK_AXES.find((a) => Math.abs(a.dot(sunDir)) < 0.9) ?? _q.set(0, 0, 1)
  _q.copy(axis).addScaledVector(sunDir, -sunDir.dot(axis)).normalize()
  up.copy(sunDir).multiplyScalar(Math.sin(eSol)).addScaledVector(_q, Math.cos(eSol)).normalize()
  // Horizontal unit towards the Sun's azimuth, and the one 90 degrees round from it.
  _f.copy(sunDir).addScaledVector(up, -Math.sin(eSol)).normalize()
  _r.crossVectors(_f, up).normalize()
  const eHost = view.hostElevationDeg * DEG
  const az = view.solAzimuthFromHostDeg * DEG
  hostDir
    .copy(up)
    .multiplyScalar(Math.sin(eHost))
    .addScaledVector(_f, Math.cos(eHost) * Math.cos(az))
    .addScaledVector(_r, Math.cos(eHost) * Math.sin(az))
    .normalize()
}
