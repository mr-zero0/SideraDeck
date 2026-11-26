// Builds the star catalog from the HYG star database (CC BY-SA 4.0).
// Keeps real 3D positions (parsecs, J2000 equatorial) and absolute magnitudes, so the sky can be
// re-rendered from any vantage point: the client derives apparent magnitude from distance.
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HYG_URL = 'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, '.cache', 'hyg', 'hygdata_v41.csv')

const readJson = async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8'))
const scene = await readJson('config/scene-config.json')
const vantages = await readJson('config/star-vantages.json')
const OUT = join(ROOT, 'public', scene.starfield.dataUrl)
const limit = scene.starfield.catalogFaintestMagnitude
const named = new Set(vantages.stars.map((s) => s.hygName))

async function exists(p) {
  try {
    return (await stat(p)).size > 0
  } catch {
    return false
  }
}

if (!(await exists(CACHE))) {
  console.log(`Downloading ${HYG_URL}`)
  const res = await fetch(HYG_URL)
  if (!res.ok) throw new Error(`HYG download failed: HTTP ${res.status}`)
  await mkdir(dirname(CACHE), { recursive: true })
  await writeFile(CACHE, Buffer.from(await res.arrayBuffer()))
}

function splitCsv(line) {
  const out = []
  let cur = ''
  let quoted = false
  for (const ch of line) {
    if (ch === '"') quoted = !quoted
    else if (ch === ',' && !quoted) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

const lines = (await readFile(CACHE, 'utf8')).split(/\r?\n/)
const header = splitCsv(lines[0] ?? '')
const col = (name) => {
  const i = header.indexOf(name)
  if (i < 0) throw new Error(`HYG column "${name}" missing`)
  return i
}
const [iId, iProper, iMag, iAbs, iCi, iX, iY, iZ, iDist] = ['id', 'proper', 'mag', 'absmag', 'ci', 'x', 'y', 'z', 'dist'].map(col)

const round = (v, d) => Number(v.toFixed(d))
const rows = []
const names = {}
for (const line of lines.slice(1)) {
  if (!line) continue
  const f = splitCsv(line)
  const proper = f[iProper] ?? ''
  const mag = Number(f[iMag])
  const dist = Number(f[iDist])
  const isSun = f[iId] === '0'
  // dist >= 100000 marks an unknown distance in HYG. The Sun (id 0) is kept: from other stars it is a star.
  const wanted = isSun || named.has(proper) || mag <= limit
  if (!wanted || (!isSun && !(dist > 0 && dist < 100000))) continue
  const ci = f[iCi] === '' ? 0.65 : Number(f[iCi])
  rows.push({ proper, mag, row: [round(Number(f[iX]), 4), round(Number(f[iY]), 4), round(Number(f[iZ]), 4), round(Number(f[iAbs]), 3), round(ci, 3)] })
}
rows.sort((a, b) => a.mag - b.mag)
rows.forEach((r, i) => {
  // Vantage stars always; other proper-named stars if bright enough to be worth labelling.
  if (named.has(r.proper) || (r.proper && r.mag <= scene.starfield.namedStarMagnitude)) names[r.proper] = i
  if (r.mag < -26) names.Sol = i
})
const missing = [...named].filter((n) => names[n] === undefined)
if (missing.length) throw new Error(`Vantage stars missing from HYG: ${missing.join(', ')}`)

await mkdir(dirname(OUT), { recursive: true })
await writeFile(
  OUT,
  JSON.stringify({
    source: 'HYG Database v4.1, https://github.com/astronexus/HYG-Database',
    license: 'CC BY-SA 4.0',
    frame: 'J2000 equatorial, parsecs, Sun at origin',
    fields: ['x', 'y', 'z', 'absmag', 'ci'],
    names,
    stars: rows.flatMap((r) => r.row),
  }),
)
console.log(`Wrote ${rows.length} stars (mag <= ${limit} plus ${named.size} vantage stars and the Sun) to ${OUT}`)
