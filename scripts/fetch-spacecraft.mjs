// Fetches spacecraft trajectories from JPL Horizons (free, no key) into public/data/spacecraft.json.
// Uniform time steps let the client interpolate with index arithmetic.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const cfg = JSON.parse(await readFile(join(ROOT, 'config', 'spacecraft.json'), 'utf8'))
const OUT = join(ROOT, 'public', cfg.dataUrl)
const JD_UNIX_EPOCH = 2440587.5
const MS_PER_DAY = 86_400_000
const DECIMALS = 7

async function horizons(c) {
  const q = new URLSearchParams({
    format: 'json',
    COMMAND: `'${c.horizonsId}'`,
    EPHEM_TYPE: 'VECTORS',
    CENTER: "'500@10'",
    START_TIME: `'${c.start}'`,
    STOP_TIME: `'${c.stop}'`,
    STEP_SIZE: `'${c.step}'`,
    REF_PLANE: 'ECLIPTIC',
    VEC_TABLE: '1',
    OUT_UNITS: 'AU-D',
    CSV_FORMAT: 'YES',
  })
  const res = await fetch(`${cfg.horizonsUrl}?${q}`)
  if (!res.ok) throw new Error(`${c.name}: HTTP ${res.status}`)
  const body = await res.json()
  const text = body.result ?? ''
  const table = text.split('$$SOE')[1]?.split('$$EOE')[0]
  if (!table) throw new Error(`${c.name}: no vectors (${(body.error ?? text).slice(0, 300).replace(/\s+/g, ' ')})`)
  // CSV rows: JDTDB, Calendar Date, X, Y, Z,
  return table
    .trim()
    .split('\n')
    .map((l) => l.split(',').map((s) => s.trim()))
    .map((f) => ({ jd: Number(f[0]), xyz: [Number(f[2]), Number(f[3]), Number(f[4])] }))
}

const out = []
for (const c of cfg.craft) {
  const rows = await horizons(c)
  if (rows.length < 2) throw new Error(`${c.name}: fewer than 2 samples`)
  const startMs = (rows[0].jd - JD_UNIX_EPOCH) * MS_PER_DAY
  const stepMs = (rows[1].jd - rows[0].jd) * MS_PER_DAY
  out.push({ id: c.id, startMs: Math.round(startMs), stepMs: Math.round(stepMs), xyz: rows.flatMap((r) => r.xyz.map((v) => Number(v.toFixed(DECIMALS)))) })
  console.log(`OK ${c.name}: ${rows.length} samples, ${new Date(startMs).toISOString().slice(0, 10)} + ${c.step}`)
}

await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, JSON.stringify({ source: cfg.source, frame: 'heliocentric ecliptic J2000, AU (TDB timestamps)', craft: out }))
console.log(`Wrote ${OUT}`)
