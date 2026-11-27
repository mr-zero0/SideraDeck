import { HelioVector } from 'astronomy-engine'
import { getBody } from '../config'
import { eqjToEcl, type Vec3 } from './frames'
import { craftPositionAu, type CraftTrack } from './spacecraft'

const CRAFT_PREFIX = 'craft:'

/** Heliocentric ecliptic J2000 position (AU) of a body id or `craft:<id>`; null when unknown at `date`. */
export function helioEclAu(id: string, date: Date, tracks: readonly CraftTrack[] | null): Vec3 | null {
  if (id.startsWith(CRAFT_PREFIX)) {
    const track = tracks?.find((t) => t.id === id.slice(CRAFT_PREFIX.length))
    return track ? craftPositionAu(track, date.getTime()) : null
  }
  const v = HelioVector(getBody(id).ephemerisBody, date)
  return eqjToEcl([v.x, v.y, v.z])
}
