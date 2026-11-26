// Downloads every texture the registry references from Solar System Scope (CC BY 4.0),
// including the 8K maps under /textures/hires/ (gitignored; loaded only when zoomed in).
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_BASE = 'https://www.solarsystemscope.com/textures/download/'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const registry = JSON.parse(await readFile(join(ROOT, 'config', 'celestial-registry.json'), 'utf8'))
const paths = new Set(
  registry.bodies
    .flatMap((b) => [b.render.albedoMap, b.render.nightMap, b.render.clouds?.map, b.render.ring?.map, ...Object.values(b.render.hiRes ?? {})])
    .filter(Boolean),
)

for (const p of paths) {
  const out = join(ROOT, 'public', p)
  try {
    if ((await stat(out)).size > 0) continue
  } catch {
    // not downloaded yet
  }
  const url = SOURCE_BASE + basename(p)
  const res = await fetch(url)
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !type.startsWith('image/')) {
    console.error(`SKIP ${p}: HTTP ${res.status} ${type}`)
    continue
  }
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, Buffer.from(await res.arrayBuffer()))
  console.log(`OK   ${p}`)
}
