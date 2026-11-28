import { Suspense, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { BufferAttribute, BufferGeometry, Color, Group, Quaternion, Vector3, type Texture } from 'three'
import { getBody, getExoplanet, sceneConfig } from '../../config'
import { terrainGlsl } from '../../lib/terrain'
import { useSpaceStore } from '../../store/useSpaceStore'
import { ErrorBoundary } from '../ErrorBoundary'
import { useSim } from './simContext'

const { vantage: vc, lighting, skies } = sceneConfig
const tc = vc.terrain
const MAX_RELIEF_M = tc.octaves.reduce((s, o) => s + o.amplitudeM, 0)
// Beyond the geometric horizon from the highest eye position, so the patch always reaches the skyline.
const HORIZON_MARGIN = 1.6
// Earth's angular radius from the Moon (~0.95 deg): earthshine is scaled relative to that view.
const EARTH_FROM_MOON_RAD = 0.0166

/** Polar grid in metres, ring spacing geometric so detail is dense at your feet and sparse at the horizon. */
function polarGrid(radiusM: number): BufferGeometry {
  const pos: number[] = [0, 0, 0]
  const idx: number[] = []
  const ratio = Math.pow(radiusM / tc.innerRadiusM, 1 / (tc.rings - 1))
  for (let r = 0; r < tc.rings; r++) {
    const rad = tc.innerRadiusM * ratio ** r
    for (let s = 0; s < tc.segments; s++) {
      const a = (s / tc.segments) * Math.PI * 2
      pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad)
    }
  }
  const at = (r: number, s: number) => 1 + r * tc.segments + (s % tc.segments)
  for (let s = 0; s < tc.segments; s++) idx.push(0, at(0, s + 1), at(0, s))
  for (let r = 0; r < tc.rings - 1; r++) {
    for (let s = 0; s < tc.segments; s++) {
      idx.push(at(r, s), at(r, s + 1), at(r + 1, s), at(r, s + 1), at(r + 1, s + 1), at(r + 1, s))
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setIndex(idx)
  return g
}

/** Average albedo colour around the standing point, read from the planet's own texture. */
function sampleSurface(tex: Texture, localUp: Vector3): Color {
  const img = tex.image as CanvasImageSource & { width: number; height: number }
  const w = 256
  const h = 128
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return new Color(1, 1, 1)
  ctx.drawImage(img, 0, 0, w, h)
  // three's SphereGeometry: longitude 0 on local +X, increasing toward -Z; v = 0 at the north pole row.
  const u = 0.5 + Math.atan2(-localUp.z, localUp.x) / (2 * Math.PI)
  const row = Math.acos(Math.max(-1, Math.min(1, localUp.y))) / Math.PI
  const d = ctx.getImageData(Math.floor(((u % 1) + 1) % 1 * (w - 1)), Math.floor(row * (h - 1)), 1, 1).data
  return new Color().setRGB((d[0] ?? 255) / 255, (d[1] ?? 255) / 255, (d[2] ?? 255) / 255, 'srgb')
}

const vertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform vec2 uWalk;
  uniform float uRadiusM;
  uniform float uEye;
  uniform float uRelief;
  varying vec3 vNormal;
  varying vec2 vWorld;
  varying float vDist;
  ${terrainGlsl(tc.octaves)}
  float heightAt(vec2 p) {
    // Drop by the planet's curvature so the horizon sits where it really is.
    return uRelief * terrainHeight(p + uWalk) - dot(p, p) / (2.0 * uRadiusM) - uEye;
  }
  void main() {
    vec2 p = position.xz;
    float e = max(0.25, length(p) * 0.004);
    float h = heightAt(p);
    vNormal = normalize(vec3(heightAt(p - vec2(e, 0.0)) - heightAt(p + vec2(e, 0.0)), 2.0 * e, heightAt(p - vec2(0.0, e)) - heightAt(p + vec2(0.0, e))));
    vWorld = p + uWalk;
    vDist = length(p);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x, h, p.y, 1.0);
    #include <logdepthbuf_vertex>
  }
`
const fragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  uniform vec3 uSun;
  uniform vec3 uEarth;
  uniform float uSunIntensity;
  uniform float uAmbient;
  uniform float uEarthshine;
  uniform vec3 uSky;
  uniform float uDaylight;
  uniform float uHazeM;
  uniform float uRelief;
  varying vec3 vNormal;
  varying vec2 vWorld;
  varying float vDist;
  ${terrainGlsl([{ wavelengthM: 1, amplitudeM: 1 }])}
  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vNormal);
    // Regolith / rock detail: two scales of value noise plus scattered dark stones (fades with distance).
    float near = 1.0 - smoothstep(30.0, 400.0, vDist);
    float grain = terrainHeight(vWorld * 1.7) * 0.5 + terrainHeight(vWorld * 0.23) * 0.5;
    float stones = step(0.93, terrainHeight(vWorld * 2.9)) * near * uRelief;
    vec3 albedo = uColor * mix(1.0, 0.72 + 0.5 * grain, mix(0.35, 1.0, near)) * (1.0 - 0.45 * stones);
    float sun = max(dot(n, uSun), 0.0) * uSunIntensity;
    float earth = max(dot(n, uEarth), 0.0) * uEarthshine;
    vec3 lit = albedo * (sun + earth + uAmbient) + albedo * uSky * uDaylight * 0.35;
    float haze = uHazeM > 0.0 ? 1.0 - exp(-vDist / uHazeM) : 0.0;
    gl_FragColor = vec4(mix(lit, uSky * (0.15 + 0.85 * uDaylight), haze), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

/** What the ground patch needs, whether it comes from a registry body or an exoplanet's config. */
type Surface = { id: string; radiusM: number; color: string; hazeColor: string; hazeM: number; relief: number }

function GroundPatch({ surface, sample }: { surface: Surface; sample?: (localUp: Vector3) => Color }) {
  const sim = useSim()
  const { id, radiusM } = surface
  const geometry = useMemo(() => polarGrid(Math.max(tc.radiusM, HORIZON_MARGIN * Math.sqrt(2 * radiusM * (MAX_RELIEF_M + vc.eyeHeightM)))), [radiusM])
  const group = useRef<Group>(null)
  const inv = useMemo(() => new Quaternion(), [])
  const sampledAt = useRef<{ up: Vector3; color: Color } | null>(null)
  const uniforms = useMemo(
    () => ({
      uWalk: { value: [0, 0] as [number, number] },
      uRadiusM: { value: radiusM },
      uEye: { value: vc.eyeHeightM },
      uRelief: { value: surface.relief },
      uColor: { value: new Color(surface.color) },
      uSun: { value: new Vector3() },
      uEarth: { value: new Vector3() },
      uSunIntensity: { value: lighting.sunIntensity },
      uAmbient: { value: lighting.ambient },
      uEarthshine: { value: 0 },
      uSky: { value: new Color(surface.hazeColor) },
      uDaylight: { value: 0 },
      uHazeM: { value: surface.hazeM },
    }),
    [radiusM, surface.relief, surface.color, surface.hazeColor, surface.hazeM],
  )

  useFrame(() => {
    const g = sim.ground
    if (!g || !group.current) return
    group.current.quaternion.copy(g.quaternion)
    group.current.scale.setScalar(g.unitsPerM)
    uniforms.uWalk.value = [g.walkX, g.walkZ]
    uniforms.uEye.value = g.eyeAboveSphereM
    inv.copy(g.quaternion).invert()
    uniforms.uSun.value.copy(g.sunDir).applyQuaternion(inv)
    uniforms.uEarth.value.copy(g.earthDir).applyQuaternion(inv)
    uniforms.uDaylight.value = sim.daylight
    // Eclipses dim direct sunlight on the ground.
    uniforms.uSunIntensity.value = lighting.sunIntensity * sim.sunlight
    // Earthshine: Earth's lit fraction from here x its apparent area relative to the view from the Moon.
    const earth = sim.positions.get(vc.earthId)
    const me = sim.positions.get(id)
    if (earth && me && id !== vc.earthId) {
      const distKm = Math.hypot(earth[0] - me[0], earth[1] - me[1], earth[2] - me[2]) / sceneConfig.scaleModes.true.unitsPerKm
      const angular = getBody(vc.earthId).telemetry.radiusKm / distKm
      const lit = (1 + g.sunDir.dot(g.earthDir.clone().negate())) / 2
      uniforms.uEarthshine.value = vc.earthshineIntensity * lit * Math.min(1, (angular / EARTH_FROM_MOON_RAD) ** 2)
    } else uniforms.uEarthshine.value = 0
    // Resample the surface colour only after walking a noticeable distance.
    if (sample && (!sampledAt.current || sampledAt.current.up.angleTo(g.localUp) > 0.002)) {
      sampledAt.current = { up: g.localUp.clone(), color: sample(g.localUp) }
      uniforms.uColor.value.copy(sampledAt.current.color)
    }
  })

  return (
    <group ref={group}>
      <mesh geometry={geometry} frustumCulled={false} raycast={() => null}>
        <shaderMaterial vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} />
      </mesh>
    </group>
  )
}

function BodyPatch({ bodyId }: { bodyId: string }) {
  const body = getBody(bodyId)
  const tex = useTexture(body.render.albedoMap)
  const sky = skies.bodies[bodyId]
  const surface = useMemo<Surface>(
    () => ({
      id: bodyId,
      radiusM: body.telemetry.radiusKm * 1000,
      color: body.render.fallbackColor,
      hazeColor: body.render.atmosphere?.color ?? '#000000',
      hazeM: sky ? sky.hazeKm * 1000 : 0,
      relief: vc.noTerrainBodyIds.includes(bodyId) ? 0 : 1,
    }),
    [bodyId, body, sky],
  )
  const sample = useMemo(() => (up: Vector3) => sampleSurface(tex, up), [tex])
  return <GroundPatch surface={surface} sample={sample} />
}

function ExoplanetPatch({ id }: { id: string }) {
  const ex = getExoplanet(id)
  const surface = useMemo<Surface | null>(
    () =>
      ex
        ? {
        id,
        radiusM: ex.planet.radiusEarth * getBody(vc.earthId).telemetry.radiusKm * 1000,
        color: ex.illustrative.groundColor,
        hazeColor: ex.illustrative.hazeColor,
        hazeM: ex.illustrative.sky.hazeKm * 1000,
        relief: 1,
      }
        : null,
    [ex, id],
  )
  return surface && <GroundPatch surface={surface} />
}

/** Ground under your feet in first person on a world. Camera-centred, so it never jitters. */
export function TerrainPatch() {
  const ground = useSpaceStore((s) => (s.pov === 'vantage' && (s.vantage.kind === 'body' || s.vantage.kind === 'exoplanet') ? s.vantage : null))
  if (!ground) return null
  return (
    <ErrorBoundary label="terrain" fallback={null}>
      <Suspense fallback={null}>
        {ground.kind === 'body' ? <BodyPatch key={ground.id} bodyId={ground.id} /> : <ExoplanetPatch key={ground.id} id={ground.id} />}
      </Suspense>
    </ErrorBoundary>
  )
}
