import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, CanvasTexture, Sprite } from 'three'
import { sceneConfig } from '../../config'
import { useSim } from './simContext'

// Placed beyond the terrain (tens of km) but inside the sky dome: the ground hides it after sunset.
const GLARE_DISTANCE_UNITS = 1e-3
const TEXTURE_PX = 256

function glareTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = TEXTURE_PX
  const ctx = c.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(TEXTURE_PX / 2, TEXTURE_PX / 2, 0, TEXTURE_PX / 2, TEXTURE_PX / 2, TEXTURE_PX / 2)
    g.addColorStop(0, 'rgba(255,250,235,1)')
    g.addColorStop(0.06, 'rgba(255,240,210,0.9)')
    g.addColorStop(0.25, 'rgba(255,210,160,0.18)')
    g.addColorStop(1, 'rgba(255,200,150,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, TEXTURE_PX, TEXTURE_PX)
  }
  return new CanvasTexture(c)
}

/** Eye-level glare around the Sun (no post-processing dependency). Only while standing on a world. */
export function SunGlare() {
  const sim = useSim()
  const ref = useRef<Sprite>(null)
  const map = useMemo(glareTexture, [])
  const size = 2 * GLARE_DISTANCE_UNITS * Math.tan((sceneConfig.vantage.sunGlareDeg * Math.PI) / 180)

  useFrame(({ camera }) => {
    const s = ref.current
    if (!s) return
    const g = sim.ground
    // Hidden when the Sun is covered: the sprite sits nearer than the Moon, so depth alone can't hide it.
    s.visible = g !== null && sim.sunlight > 0
    s.material.opacity = sim.sunlight
    if (g) s.position.copy(camera.position).addScaledVector(g.sunDir, GLARE_DISTANCE_UNITS)
  })

  return (
    <sprite ref={ref} scale={[size, size, 1]} renderOrder={2}>
      <spriteMaterial map={map} blending={AdditiveBlending} depthWrite={false} toneMapped={false} transparent />
    </sprite>
  )
}
