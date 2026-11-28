import { createContext, useContext } from 'react'
import type { Group, Quaternion, Vector3 } from 'three'
import type { Vec3 } from '../../lib/frames'

/** Observer parked near another star: directions (scene axes) seen from there. */
export type StarView = {
  starDir: Vector3
  sunDir: Vector3
  sunDistancePc: number
  starName: string
  color: [number, number, number]
  /** Standing on an exoplanet: the local vertical (null when floating near a star). */
  up: Vector3 | null
}

/** Per-frame simulation state shared by refs, so 60 fps updates never trigger React renders. */
export type SimFrame = {
  date: Date
  /** Bodies by id and spacecraft by `craft:<id>`, scene units, Sun at origin. */
  positions: Map<string, Vec3>
  /** Root group translated by -focus: the focused body sits at the origin (floating origin). */
  world: { current: Group | null }
  /** Id at the origin. Differs from the selection in the Solar / Milky Way views and first person. */
  focusId: string
  /** 0 = stars on the sky sphere, 1 = stars at their true 3D positions (Milky Way context). */
  galacticMix: number
  /** Local Group view: kpc-scale point the camera orbits (a galaxy, or the Sun). */
  localGroupFocus: Vector3
  /** Set by the starfield while the observer is at another star. */
  starView: StarView | null
  /** DOM label elements, positioned per frame by BodyLabelProjector. */
  labels: Map<string, HTMLElement>
  /** Standing on a world at eye level; null otherwise. Written by the camera rig. */
  ground: Ground | null
  /** 0 = night sky, 1 = full daylight glare (fades stars and planet points). */
  daylight: number
  /** Fraction of the Sun's disc not hidden by another body (eclipses), from the eye. */
  sunlight: number
  /** Star catalog and the observer's position in it, for labelling named stars. */
  stars: { positions3d: Float32Array; absMags: Float32Array; names: Record<string, number>; vantage: Vector3 } | null
}

/**
 * Eye-level frame. The camera sits at the origin; the ground's local axes are X = east, Y = up,
 * Z = south, in metres, scaled into scene units by `unitsPerM`.
 */
export type Ground = {
  bodyId: string
  /** Standing point as a body-fixed unit normal (for texture lookup). */
  localUp: Vector3
  quaternion: Quaternion
  /** Metres walked from the entry point, east (x) and south (z): the terrain noise is anchored there. */
  walkX: number
  walkZ: number
  /** Eye height above the reference sphere, metres (terrain height + eye height). */
  eyeAboveSphereM: number
  radiusM: number
  unitsPerM: number
  terrain: boolean
  sunDir: Vector3
  earthDir: Vector3
}

export const SimContext = createContext<SimFrame | null>(null)

export function useSim(): SimFrame {
  const sim = useContext(SimContext)
  if (!sim) throw new Error('useSim must be used inside <SpaceScene>')
  return sim
}

/** useFrame priorities: ephemeris, spacecraft, then camera/origin, then bodies (default 0). */
export const FRAME_PRIORITY = { ephemeris: -3, craft: -2, camera: -1 } as const

/** Latest frame for DOM consumers outside the canvas (FDE inspector). Written once per frame. */
export const frameStats = { fps: 0, drawCalls: 0, triangles: 0 }

/** Star vantage geometry for the HUD (outside the canvas): observer position, ecliptic AU, Sun at origin. */
export const liveStarVantage: { observerEclAu: [number, number, number] | null; sunDistancePc: number } = { observerEclAu: null, sunDistancePc: 0 }

/** Analog walk input from the on-screen pad (x = strafe right, z = forward), each -1..1. */
export const walkInput = { x: 0, z: 0 }

/** Postcard capture: renders one frame and reads it back, plus the visible DOM labels to draw on top. */
export type SnapshotLabel = { text: string; x: number; y: number; star: boolean }
export const snapshot: { capture: (() => { png: string; width: number; height: number; cssWidth: number; cssHeight: number; labels: SnapshotLabel[] }) | null } = {
  capture: null,
}

/** First-person tap on the sky, in normalised device coordinates. Set by the identify layer. */
export const skyTap: { handler: ((ndcX: number, ndcY: number) => void) | null } = { handler: null }

export const GALACTIC_CENTER_LABEL_ID = 'galactic-center'
/** Look target meaning "the star you are visiting" in a star vantage. */
export const VANTAGE_STAR_TARGET = 'vantage-star'
export const galaxyKey = (id: string) => `galaxy:${id}`
export const starKey = (name: string) => `star:${name}`
