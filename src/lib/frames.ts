// Mean obliquity of the ecliptic at J2000 (IAU 2006), a physical constant rather than a tunable.
export const OBLIQUITY_J2000_DEG = 23.4392911

export type Vec3 = [number, number, number]

const EPS = (OBLIQUITY_J2000_DEG * Math.PI) / 180
const COS_E = Math.cos(EPS)
const SIN_E = Math.sin(EPS)

/** J2000 mean equator (EQJ) -> J2000 mean ecliptic (ECL). */
export const eqjToEcl = ([x, y, z]: readonly [number, number, number]): Vec3 => [
  x,
  y * COS_E + z * SIN_E,
  -y * SIN_E + z * COS_E,
]

/** Ecliptic -> three.js scene axes: ecliptic plane is XZ, ecliptic north is +Y. */
export const eclToScene = ([x, y, z]: readonly [number, number, number]): Vec3 => [x, z, -y]

export const eqjToScene = (v: readonly [number, number, number]): Vec3 => eclToScene(eqjToEcl(v))

/** Unit vector (J2000 equatorial) for a right ascension / declination in degrees. */
export function raDecToEqj(raDeg: number, decDeg: number): Vec3 {
  const ra = (raDeg * Math.PI) / 180
  const dec = (decDeg * Math.PI) / 180
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]
}

// IAU galactic frame (J2000): Sgr A* direction and north galactic pole. Physical constants.
export const GALACTIC_CENTER_EQJ = raDecToEqj(266.40499, -28.93617)
export const GALACTIC_NORTH_POLE_EQJ = raDecToEqj(192.85948, 27.12825)
