import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { PerspectiveCamera, Vector3 } from 'three'
import { registry, sceneConfig, spacecraftConfig } from '../../config'
import { limitingMagnitude } from '../../lib/photometry'
import { scaleRadiusKm } from '../../lib/scale'
import { craftKey, useSpaceStore } from '../../store/useSpaceStore'
import { useStarNames } from '../../store/useStarNames'
import { skyTap, useSim } from './simContext'

// Touch-friendly pick radius around a tap, in screen pixels.
const PICK_PX = 22
const DEG = Math.PI / 180
const SUN_CATALOG_NAME = 'Sol'

/** First person: a tap on the sky picks the nearest planet, spacecraft or named star under the finger. */
export function IdentifyLayer() {
  const sim = useSim()
  const camera = useThree((s) => s.camera)
  const height = useThree((s) => s.size.height)
  const v = useMemo(() => ({ ray: new Vector3(), dir: new Vector3() }), [])

  useEffect(() => {
    skyTap.handler = (ndcX, ndcY) => {
      const st = useSpaceStore.getState()
      if (st.pov !== 'vantage' || !(camera instanceof PerspectiveCamera) || !sim.world.current) return
      v.ray.set(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize()
      const threshold = PICK_PX * ((st.fovDeg * DEG) / height)
      const offset = sim.world.current.position
      let best: { kind: 'body' | 'star' | 'craft'; id: string; score: number } | null = null
      const consider = (kind: 'body' | 'star' | 'craft', id: string, angularRadius: number) => {
        const score = Math.max(0, v.ray.angleTo(v.dir) - angularRadius)
        if (score <= threshold && (!best || score < best.score)) best = { kind, id, score }
      }

      if (sim.world.current.visible) {
        for (const b of registry.bodies) {
          const p = sim.positions.get(b.id)
          if (!p || b.id === sim.focusId) continue
          v.dir.set(p[0], p[1], p[2]).add(offset).sub(camera.position)
          consider('body', b.id, Math.asin(Math.min(1, scaleRadiusKm(b.telemetry.radiusKm, 'true', sceneConfig) / v.dir.length())))
        }
        for (const c of spacecraftConfig.craft) {
          const p = sim.positions.get(craftKey(c.id))
          if (!p || craftKey(c.id) === sim.focusId) continue
          v.dir.set(p[0], p[1], p[2]).add(offset).sub(camera.position)
          consider('craft', c.id, 0)
        }
      }
      const stars = sim.stars
      if (stars) {
        const limit = limitingMagnitude(st.fovDeg, sceneConfig.optics)
        for (const [name, i] of Object.entries(stars.names)) {
          // From home the Sun is a body; elsewhere it is just a catalog star.
          if (name === SUN_CATALOG_NAME && sim.world.current.visible) continue
          v.dir.set((stars.positions3d[i * 3] ?? 0) - stars.vantage.x, (stars.positions3d[i * 3 + 1] ?? 0) - stars.vantage.y, (stars.positions3d[i * 3 + 2] ?? 0) - stars.vantage.z)
          const pc = v.dir.length() / sceneConfig.starfield.unitsPerParsec
          if (pc < 1e-3 || (stars.absMags[i] ?? 99) + 5 * Math.log10(pc / 10) > limit) continue
          consider('star', name, 0)
        }
      }
      const picked = best as { kind: 'body' | 'star' | 'craft'; id: string } | null
      st.setIdentified(picked ? { kind: picked.kind, id: picked.id } : null)
    }
    return () => {
      skyTap.handler = null
    }
  }, [camera, height, sim, v])

  // Names change when the catalog loads; nothing to render.
  useStarNames((s) => s.names)
  return null
}
