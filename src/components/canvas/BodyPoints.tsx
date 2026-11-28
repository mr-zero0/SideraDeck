import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { KM_PER_AU } from 'astronomy-engine'
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, MathUtils } from 'three'
import { registry, sceneConfig } from '../../config'
import type { Vec3 } from '../../lib/frames'
import { limitingMagnitude, observe } from '../../lib/photometry'
import { useSpaceStore } from '../../store/useSpaceStore'
import { useSim } from './simContext'

const { starfield: sf, optics } = sceneConfig
const AU_PER_UNIT = 1 / (KM_PER_AU * sceneConfig.scaleModes.true.unitsPerKm)
// Below ~2 px a disc is not resolved: show the body as a point of light, fading out as the disc grows.
const RESOLVED_FROM_PX = 1.5
const RESOLVED_BY_PX = 4
// Bright planets (Venus, Jupiter) can still be glimpsed in daylight, so they fade less than stars.
const DAYLIGHT_FADE = 0.85

const vertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float size;
  attribute float alpha;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = alpha;
    gl_PointSize = size * uPixelRatio;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`
const fragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    #include <logdepthbuf_fragment>
    if (vAlpha <= 0.0) discard;
    float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)) * vAlpha;
    gl_FragColor = vec4(vColor * a, a);
    #include <colorspace_fragment>
  }
`

const toAu = (p: Vec3): Vec3 => [p[0] * AU_PER_UNIT, p[1] * AU_PER_UNIT, p[2] * AU_PER_UNIT]

/**
 * First person only: planets too small to resolve appear as points with their real brightness,
 * e.g. Earth from Mars is a magnitude -1 to -2.5 blue "star". Lives in the world group.
 */
export function BodyPoints() {
  const sim = useSim()
  const active = useSpaceStore((s) => s.pov === 'vantage' && s.vantage.kind !== 'star' && s.vantage.kind !== 'exoplanet')
  const height = useThree((s) => s.size.height)
  const dpr = useThree((s) => s.viewport.dpr)
  const n = registry.bodies.length
  const { geometry, uniforms } = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3))
    g.setAttribute('size', new BufferAttribute(new Float32Array(n), 1))
    g.setAttribute('alpha', new BufferAttribute(new Float32Array(n), 1))
    const colors = new Float32Array(n * 3)
    registry.bodies.forEach((b, i) => colors.set(new Color(b.render.fallbackColor).toArray(), i * 3))
    g.setAttribute('color', new BufferAttribute(colors, 3))
    return { geometry: g, uniforms: { uPixelRatio: { value: dpr } } }
  }, [n, dpr])

  useFrame(() => {
    if (!active) return
    const { fovDeg } = useSpaceStore.getState()
    const observer = sim.positions.get(sim.focusId)
    if (!observer) return
    const pos = geometry.getAttribute('position') as BufferAttribute
    const size = geometry.getAttribute('size') as BufferAttribute
    const alpha = geometry.getAttribute('alpha') as BufferAttribute
    const limit = limitingMagnitude(fovDeg, optics)
    const pxPerArcsec = height / (fovDeg * 3600)
    registry.bodies.forEach((b, i) => {
      const p = sim.positions.get(b.id)
      if (!p || b.id === sim.focusId) {
        alpha.setX(i, 0)
        return
      }
      pos.setXYZ(i, p[0], p[1], p[2])
      const o = observe(b, toAu(p), toAu(observer))
      const mag = o.magnitude ?? limit
      const k = MathUtils.clamp((limit - mag) / (limit - sf.brightestMagnitude), 0, 1)
      const visible = mag <= limit ? sf.minAlpha + (1 - sf.minAlpha) * k : 0
      size.setX(i, MathUtils.lerp(sf.minPointSizePx, sf.maxPointSizePx, k))
      alpha.setX(i, visible * (1 - DAYLIGHT_FADE * sim.daylight) * (1 - MathUtils.smoothstep(o.angularDiameterArcsec * pxPerArcsec, RESOLVED_FROM_PX, RESOLVED_BY_PX)))
    })
    pos.needsUpdate = true
    size.needsUpdate = true
    alpha.needsUpdate = true
  })

  if (!active) return null
  return (
    <points geometry={geometry} frustumCulled={false} raycast={() => null}>
      <shaderMaterial vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} vertexColors transparent depthWrite={false} blending={AdditiveBlending} />
    </points>
  )
}
