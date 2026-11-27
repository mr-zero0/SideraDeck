import { Vector3 } from 'three'
import type { Galaxy } from '../schemas/explore'
import { GALACTIC_CENTER_EQJ, GALACTIC_NORTH_POLE_EQJ, eqjToScene, raDecToEqj } from './frames'

const DEG = Math.PI / 180
const toScene = (v: readonly [number, number, number]) => new Vector3(...eqjToScene(v))

export type DiscFrame = { position: Vector3; normal: Vector3; major: Vector3 }

/**
 * Orients a galaxy disc from its sky position, position angle (north through east) and inclination
 * (0 = face-on). The sign of the tilt is ambiguous from imaging alone; either choice looks identical.
 */
export function galaxyFrame(g: Galaxy, unitsPerKpc: number): DiscFrame {
  const a = g.raDeg * DEG
  const d = g.decDeg * DEG
  const los = raDecToEqj(g.raDeg, g.decDeg)
  const east: [number, number, number] = [-Math.sin(a), Math.cos(a), 0]
  const north: [number, number, number] = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)]
  const pa = g.positionAngleDeg * DEG
  const lineOfSight = toScene(los)
  const major = toScene(north).multiplyScalar(Math.cos(pa)).add(toScene(east).multiplyScalar(Math.sin(pa))).normalize()
  const i = g.inclinationDeg * DEG
  const normal = lineOfSight.clone().multiplyScalar(Math.cos(i)).add(new Vector3().crossVectors(major, lineOfSight).multiplyScalar(Math.sin(i))).normalize()
  return { position: lineOfSight.multiplyScalar(g.distanceKpc * unitsPerKpc), normal, major }
}

/** The Milky Way disc seen from outside: centred on Sgr A*, normal to the galactic plane. */
export function milkyWayFrame(sunToCenterKpc: number, unitsPerKpc: number): DiscFrame {
  const center = toScene(GALACTIC_CENTER_EQJ)
  return { position: center.clone().multiplyScalar(sunToCenterKpc * unitsPerKpc), normal: toScene(GALACTIC_NORTH_POLE_EQJ).normalize(), major: center.normalize() }
}
