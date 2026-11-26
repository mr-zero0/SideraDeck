import { z } from 'zod'
import type { SceneConfig } from '../schemas/scene'
import { eqjToScene } from './frames'

export const StarCatalogSchema = z.object({
  fields: z.tuple([z.literal('x'), z.literal('y'), z.literal('z'), z.literal('absmag'), z.literal('ci')]),
  names: z.record(z.string(), z.number().int().nonnegative()),
  stars: z.array(z.number()).refine((a) => a.length % 5 === 0, 'stars must be a flat array of 5-tuples'),
})

export type StarBuffers = {
  count: number
  /** True 3D position, parsecs x unitsPerParsec, Sun at the origin. */
  positions3d: Float32Array
  absMags: Float32Array
  /** Blackbody colour from B-V; brightness is applied in the shader from the observer's distance. */
  colors: Float32Array
  /** HYG proper name -> star index. */
  names: Record<string, number>
  /** The catalog rows as loaded (x, y, z parsecs J2000 equatorial, absmag, B-V), for identify facts. */
  raw: Float32Array
}

/** Ballesteros (2012) B-V -> effective temperature. */
export const bvToTemperatureK = (bv: number): number => 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Blackbody colour approximation (Helland), returned as 0..1 RGB. */
export function temperatureToRgb(kelvin: number): [number, number, number] {
  const t = kelvin / 100
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  return [clamp01(r / 255), clamp01(g / 255), clamp01(b / 255)]
}

export function buildStarBuffers(raw: unknown, cfg: SceneConfig['starfield']): StarBuffers {
  const { stars, names } = StarCatalogSchema.parse(raw)
  const count = stars.length / 5
  const positions3d = new Float32Array(count * 3)
  const absMags = new Float32Array(count)
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const o = i * 5
    const u = cfg.unitsPerParsec
    positions3d.set(eqjToScene([(stars[o] ?? 0) * u, (stars[o + 1] ?? 0) * u, (stars[o + 2] ?? 0) * u]), i * 3)
    absMags[i] = stars[o + 3] ?? 0
    colors.set(temperatureToRgb(bvToTemperatureK(stars[o + 4] ?? 0)), i * 3)
  }
  return { count, positions3d, absMags, colors, names, raw: Float32Array.from(stars) }
}
