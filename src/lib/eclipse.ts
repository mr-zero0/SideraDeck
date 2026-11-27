/**
 * Fraction of the Sun's disc still visible when another disc (Moon, Earth, a planet) passes in front,
 * from the angular radii of both discs and the angle between their centres (all radians).
 * Uniform-disc approximation (limb darkening ignored): exact for totality and no-overlap cases.
 */
export function sunVisibleFraction(sunRadius: number, occluderRadius: number, separation: number): number {
  const R = sunRadius
  const r = occluderRadius
  const d = separation
  if (d >= R + r) return 1
  if (d <= r - R) return 0
  if (d <= R - r) return 1 - (r * r) / (R * R)
  // Partial overlap: lens area of two intersecting circles.
  const a = r * r * Math.acos((d * d + r * r - R * R) / (2 * d * r))
  const b = R * R * Math.acos((d * d + R * R - r * r) / (2 * d * R))
  const c = 0.5 * Math.sqrt(Math.max(0, (-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R)))
  return Math.min(1, Math.max(0, 1 - (a + b - c) / (Math.PI * R * R)))
}

export type Disc = { dir: readonly [number, number, number]; radius: number }

const angleBetween = (a: readonly number[], b: readonly number[]) => {
  const dot = (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0)
  const la = Math.hypot(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0)
  const lb = Math.hypot(b[0] ?? 0, b[1] ?? 0, b[2] ?? 0)
  return Math.acos(Math.min(1, Math.max(-1, dot / (la * lb))))
}

/**
 * Sunlight reaching an observer given the Sun and the discs that could block it (positions relative
 * to the observer, any consistent unit). Takes the darkest single occluder: two at once never matters here.
 */
export function sunlightFraction(sunVec: readonly number[], sunRadius: number, occluders: readonly { vec: readonly number[]; radius: number }[]): number {
  const sunDist = Math.hypot(sunVec[0] ?? 0, sunVec[1] ?? 0, sunVec[2] ?? 0)
  const R = Math.asin(Math.min(1, sunRadius / sunDist))
  let f = 1
  for (const o of occluders) {
    const dist = Math.hypot(o.vec[0] ?? 0, o.vec[1] ?? 0, o.vec[2] ?? 0)
    if (dist >= sunDist || dist <= o.radius) continue
    f = Math.min(f, sunVisibleFraction(R, Math.asin(o.radius / dist), angleBetween(sunVec, o.vec)))
  }
  return f
}
