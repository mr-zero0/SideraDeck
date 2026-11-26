import { buildStarBuffers } from '../lib/starfield'
import type { SceneConfig } from '../schemas/scene'

export type StarfieldRequest = SceneConfig['starfield']

self.onmessage = async (e: MessageEvent<StarfieldRequest>) => {
  try {
    const res = await fetch(e.data.dataUrl)
    if (!res.ok) throw new Error(`Star catalog HTTP ${res.status}`)
    const b = buildStarBuffers(await res.json(), e.data)
    self.postMessage({ ok: true, buffers: b }, { transfer: [b.positions3d.buffer, b.absMags.buffer, b.colors.buffer, b.raw.buffer] })
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
