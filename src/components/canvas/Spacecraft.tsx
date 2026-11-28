import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { sceneConfig } from '../../config'
import { eclToScene } from '../../lib/frames'
import { scaleVector } from '../../lib/scale'
import { craftPositionAu } from '../../lib/spacecraft'
import { useCraftStore } from '../../store/useCraftStore'
import { craftKey, useSpaceStore } from '../../store/useSpaceStore'
import { FRAME_PRIORITY, useSim } from './simContext'

/** Adds every spacecraft with ephemeris coverage at the sim date to sim.positions as `craft:<id>`. */
export function Spacecraft() {
  const sim = useSim()
  const tracks = useCraftStore((s) => s.tracks)
  const load = useCraftStore((s) => s.load)
  useEffect(() => void load(), [load])

  useFrame(() => {
    if (!tracks) return
    const mode = useSpaceStore.getState().scaleMode
    for (const t of tracks) {
      const p = craftPositionAu(t, sim.date.getTime())
      if (p) sim.positions.set(craftKey(t.id), scaleVector(eclToScene(p), mode, sceneConfig))
    }
  }, FRAME_PRIORITY.craft)
  return null
}
