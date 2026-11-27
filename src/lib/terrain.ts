import type { SceneConfig } from '../schemas/scene'

type Octave = SceneConfig['vantage']['terrain']['octaves'][number]

// Integer hash (PCG-style). Integer maths is bit-identical in JS (Math.imul) and GLSL ES 3.0 (uint),
// unlike the usual fract(sin()) hash, so the CPU knows the exact ground height the GPU draws.
const M1 = 374761393
const M2 = 668265263
const M3 = 1274126177
const MASK = 0xffffff

export function hash2(ix: number, iy: number): number {
  let h = (Math.imul(ix, M1) + Math.imul(iy, M2)) >>> 0
  h = Math.imul(h ^ (h >>> 13), M3) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return (h & MASK) / MASK
}

const fade = (t: number) => t * t * (3 - 2 * t)

export function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = fade(x - ix)
  const fy = fade(y - iy)
  const a = hash2(ix, iy)
  const b = hash2(ix + 1, iy)
  const c = hash2(ix, iy + 1)
  const d = hash2(ix + 1, iy + 1)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

/** Ground height in metres above the reference sphere at local tangent coordinates (metres). Never negative. */
export function terrainHeightM(x: number, z: number, octaves: readonly Octave[]): number {
  let h = 0
  for (const o of octaves) h += o.amplitudeM * valueNoise(x / o.wavelengthM, z / o.wavelengthM)
  return h
}

/** The same functions in GLSL, generated from the same octave list. */
export function terrainGlsl(octaves: readonly Octave[]): string {
  const f = (v: number) => v.toFixed(6)
  return /* glsl */ `
    float tHash(int ix, int iy) {
      uint h = uint(ix) * ${M1}u + uint(iy) * ${M2}u;
      h = (h ^ (h >> 13u)) * ${M3}u;
      h = h ^ (h >> 16u);
      return float(h & ${MASK}u) / ${MASK}.0;
    }
    float tNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = p - i;
      f = f * f * (3.0 - 2.0 * f);
      int ix = int(i.x); int iy = int(i.y);
      float a = tHash(ix, iy), b = tHash(ix + 1, iy), c = tHash(ix, iy + 1), d = tHash(ix + 1, iy + 1);
      return a + (b - a) * f.x + (c - a) * f.y + (a - b - c + d) * f.x * f.y;
    }
    float terrainHeight(vec2 p) {
      float h = 0.0;
      ${octaves.map((o) => `h += ${f(o.amplitudeM)} * tNoise(p / ${f(o.wavelengthM)});`).join('\n      ')}
      return h;
    }
  `
}
