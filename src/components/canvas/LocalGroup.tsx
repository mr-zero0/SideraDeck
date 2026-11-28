import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, DoubleSide, Group, Quaternion, Vector3 } from 'three'
import { galaxiesConfig } from '../../config'
import { galaxyFrame, milkyWayFrame, type DiscFrame } from '../../lib/galaxy'
import { useSpaceStore } from '../../store/useSpaceStore'
import { useSim } from './simContext'

const { unitsPerKpc, milkyWay } = galaxiesConfig
export const MILKY_WAY_ID = 'milky-way'

export type DiscEntry = { id: string; name: string; diameter: number; frame: DiscFrame; color: string; spiral: boolean }

/** Static: galaxy positions never change on human timescales. Units: kpc x unitsPerKpc, Sun at origin. */
export const LOCAL_GROUP: DiscEntry[] = [
  { id: MILKY_WAY_ID, name: milkyWay.name, diameter: milkyWay.diameterKpc * unitsPerKpc, frame: milkyWayFrame(milkyWay.sunToCenterKpc, unitsPerKpc), color: milkyWay.color, spiral: true },
  ...galaxiesConfig.galaxies.map((g) => ({
    id: g.id,
    name: g.name,
    diameter: g.diameterKpc * unitsPerKpc,
    frame: galaxyFrame(g, unitsPerKpc),
    color: g.color,
    spiral: g.type === 'spiral',
  })),
]

export function localGroupFocus(id: string | null, out: Vector3): Vector3 {
  const e = LOCAL_GROUP.find((d) => d.id === id)
  return e ? out.copy(e.frame.position) : out.set(0, 0, 0)
}

const vertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }
`
const fragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  uniform float uSpiral;
  varying vec2 vUv;
  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float th = atan(p.y, p.x);
    // Exponential disc + bulge; two logarithmic arms for spirals, clumpy falloff for irregulars.
    float disc = exp(-r * 2.4) * smoothstep(1.0, 0.7, r);
    float arms = mix(0.75 + 0.25 * sin(th * 3.0 + r * 9.0), 0.55 + 0.45 * cos(2.0 * (th - log(r + 0.04) * 2.6)), uSpiral);
    float bulge = exp(-r * r * 60.0) * mix(0.4, 1.2, uSpiral);
    float a = clamp((disc * arms + bulge) * 1.6, 0.0, 1.0);
    gl_FragColor = vec4(uColor * a, a);
    #include <colorspace_fragment>
  }
`

const Z = new Vector3(0, 0, 1)

function Disc({ entry }: { entry: DiscEntry }) {
  const uniforms = useMemo(() => ({ uColor: { value: new Color(entry.color) }, uSpiral: { value: entry.spiral ? 1 : 0 } }), [entry])
  const quaternion = useMemo(() => new Quaternion().setFromUnitVectors(Z, entry.frame.normal), [entry])
  return (
    <mesh position={entry.frame.position} quaternion={quaternion} raycast={() => null}>
      <planeGeometry args={[entry.diameter, entry.diameter]} />
      <shaderMaterial vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} side={DoubleSide} transparent depthWrite={false} blending={AdditiveBlending} />
    </mesh>
  )
}

/** Milky Way + Magellanic Clouds + Andromeda + Triangulum at their real directions and distances. */
export function LocalGroup() {
  const sim = useSim()
  const visible = useSpaceStore((s) => s.pov === 'scaleJump' && s.scaleJumpLevel === 'localGroup')
  const ref = useRef<Group>(null)
  useFrame(() => {
    ref.current?.position.copy(sim.localGroupFocus).negate()
  })
  if (!visible) return null
  return (
    <group ref={ref}>
      {LOCAL_GROUP.map((e) => (
        <Disc key={e.id} entry={e} />
      ))}
    </group>
  )
}
