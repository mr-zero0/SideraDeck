// Downloads spacecraft GLB models listed in config/spacecraft.json from NASA 3D Resources.
// Shared paths (both Voyagers use one model) are fetched once. Files are checked for the GLB magic.
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const cfg = JSON.parse(await readFile(join(ROOT, 'config', 'spacecraft.json'), 'utf8'))
const GLB_MAGIC = 'glTF'

const models = new Map(cfg.craft.filter((c) => c.model).map((c) => [c.model.path, c.model.url]))
for (const [path, url] of models) {
  const out = join(ROOT, 'public', path)
  try {
    if ((await stat(out)).size > 0) continue
  } catch {
    // not downloaded yet
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.subarray(0, 4).toString('ascii') !== GLB_MAGIC) throw new Error(`${path}: not a GLB file`)
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, bytes)
  console.log(`OK ${path} (${(bytes.length / 1024).toFixed(0)} KB)`)
}
