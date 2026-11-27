import { getCraft, sceneConfig } from '../config'
import type { ScaleMode } from '../schemas/scene'
import { scaleRadiusKm } from './scale'
import type { SpacecraftData } from '../schemas/explore'
import type { Vec3 } from './frames'

export type CraftTrack = SpacecraftData['craft'][number]

/** Heliocentric ecliptic J2000 position (AU) by linear interpolation; null outside the fetched span. */
export function craftPositionAu(track: CraftTrack, ms: number): Vec3 | null {
  const n = track.xyz.length / 3
  const f = (ms - track.startMs) / track.stepMs
  if (f < 0 || f > n - 1) return null
  const i = Math.min(Math.floor(f), n - 2)
  const t = f - i
  const at = (k: number) => track.xyz[i * 3 + k] ?? 0
  const next = (k: number) => track.xyz[(i + 1) * 3 + k] ?? 0
  return [at(0) + (next(0) - at(0)) * t, at(1) + (next(1) - at(1)) * t, at(2) + (next(2) - at(2)) * t]
}

export const trackSpan = (track: CraftTrack): [number, number] => [track.startMs, track.startMs + (track.xyz.length / 3 - 1) * track.stepMs]

/** Radius used to frame a craft: half its largest real dimension, or the marker radius without a model. */
export function craftRadiusUnits(id: string, mode: ScaleMode): number {
  const m = getCraft(id)?.model
  return scaleRadiusKm(m ? m.sizeM / 2000 : sceneConfig.vantage.craftMarkerRadiusKm, mode, sceneConfig)
}