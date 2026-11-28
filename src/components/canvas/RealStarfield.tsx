import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { KM_PER_AU } from 'astronomy-engine'
import { AdditiveBlending, BackSide, Color, Group, MeshBasicMaterial, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { exoplanetsConfig, getExoplanet, getStarVantage, sceneConfig } from '../../config'
import { hostEquatorialPc } from '../../lib/exoplanet'
import { exoplanetStanding } from '../../lib/vantage'
import { GALACTIC_CENTER_EQJ, GALACTIC_NORTH_POLE_EQJ, eqjToScene } from '../../lib/frames'
import { limitingMagnitude } from '../../lib/photometry'
import { temperatureToRgb, type StarBuffers } from '../../lib/starfield'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useSpaceStore } from '../../store/useSpaceStore'
import { useStarNames } from '../../store/useStarNames'
import type { StarLookup } from '../../shared/identify'
import { liveStarVantage, useSim, type StarView } from './simContext'

type WorkerReply = { ok: true; buffers: StarBuffers } | { ok: false; error: string }

const cfg = sceneConfig.starfield
const MIX_LAMBDA = sceneConfig.camera.transitionLambda
const AU_PER_PARSEC = 206_264.806
const SUN_CATALOG_NAME = 'Sol'
const NGP = new Vector3(...eqjToScene(GALACTIC_NORTH_POLE_EQJ)).normalize()
const GC = new Vector3(...eqjToScene(GALACTIC_CENTER_EQJ)).normalize()

const vertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  attribute float absmag;
  uniform vec3 uVantage;
  uniform float uUnitsPerPc;
  uniform float uSkyRadius;
  uniform float uMix;
  uniform float uLimit;
  uniform float uBrightest;
  uniform float uMinPx;
  uniform float uMaxPx;
  uniform float uMinAlpha;
  uniform float uPixelRatio;
  uniform float uDaylight;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 rel = position - uVantage;
    float dPc = length(rel) / uUnitsPerPc;
    // Apparent magnitude from wherever the observer is: the sky really changes between stars.
    float m = absmag + 5.0 * log(max(dPc, 1e-6) / 10.0) / log(10.0);
    float k = clamp((uLimit - m) / (uLimit - uBrightest), 0.0, 1.0);
    // The observer's own star (the Sun at home) is drawn as a body, never as a point.
    vAlpha = (m <= uLimit && dPc > 1e-4) ? (uMinAlpha + (1.0 - uMinAlpha) * k) * (1.0 - uDaylight) : 0.0;
    vColor = color;
    vec3 sky = normalize(rel) * uSkyRadius + cameraPosition;
    vec3 worldPos = mix(sky, position, uMix);
    gl_PointSize = vAlpha > 0.0 ? mix(uMinPx, uMaxPx, k) * uPixelRatio : 0.0;
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
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
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.15, d) * vAlpha;
    gl_FragColor = vec4(vColor * a, a);
    #include <colorspace_fragment>
  }
`

/** HYG stars, parsed off the main thread, rendered as seen from the current vantage point. */
export function RealStarfield() {
  const sim = useSim()
  const reduced = useReducedMotion()
  const [buffers, setBuffers] = useState<StarBuffers | null>(null)
  const dpr = useThree((s) => s.viewport.dpr)
  const uniforms = useMemo(
    () => ({
      uPixelRatio: { value: dpr },
      uMix: { value: 0 },
      uVantage: { value: new Vector3() },
      uUnitsPerPc: { value: cfg.unitsPerParsec },
      uSkyRadius: { value: cfg.sphereRadius },
      uLimit: { value: cfg.faintestMagnitude },
      uBrightest: { value: cfg.brightestMagnitude },
      uMinPx: { value: cfg.minPointSizePx },
      uMaxPx: { value: cfg.maxPointSizePx },
      uMinAlpha: { value: cfg.minAlpha },
      uDaylight: { value: 0 },
    }),
    [dpr],
  )
  const starView = useMemo<StarView>(() => ({ starDir: new Vector3(), sunDir: new Vector3(), sunDistancePc: 0, starName: '', color: [1, 1, 1], up: null }), [])
  const exoUp = useMemo(() => new Vector3(), [])

  useEffect(() => {
    const worker = new Worker(new URL('../../workers/starfield.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      if (e.data.ok) {
        setBuffers(e.data.buffers)
        // The Sun is labelled as a body, never as a catalog star.
        const b = e.data.buffers
        const lookup: StarLookup = (name) => {
          const i = b.names[name]
          if (i === undefined) return null
          return { pc: [b.raw[i * 5] ?? 0, b.raw[i * 5 + 1] ?? 0, b.raw[i * 5 + 2] ?? 0], absMag: b.raw[i * 5 + 3] ?? 0, ci: b.raw[i * 5 + 4] ?? 0 }
        }
        useStarNames.getState().set(Object.entries(b.names).filter(([n]) => n !== SUN_CATALOG_NAME), lookup)
      }
      else console.error('[starfield]', e.data.error)
      worker.terminate()
    }
    worker.postMessage(cfg)
    return () => worker.terminate()
  }, [])

  useFrame(({ camera }, delta) => {
    const { pov, scaleJumpLevel, vantage, fovDeg } = useSpaceStore.getState()
    const target = pov === 'scaleJump' && scaleJumpLevel === 'galactic' ? 1 : 0
    const k = reduced ? 1 : 1 - Math.exp(-MIX_LAMBDA * delta)
    const m = uniforms.uMix.value + (target - uniforms.uMix.value) * k
    uniforms.uMix.value = Math.abs(m - target) < 1e-3 ? target : m
    sim.galacticMix = uniforms.uMix.value
    if (buffers) sim.stars = { positions3d: buffers.positions3d, absMags: buffers.absMags, names: buffers.names, vantage: uniforms.uVantage.value }
    // Daylight glare hides stars (only through a telescope do the brightest survive: shortcut, not modelled).
    uniforms.uDaylight.value = sim.daylight
    uniforms.uLimit.value = pov === 'vantage' && camera instanceof PerspectiveCamera ? limitingMagnitude(fovDeg, sceneConfig.optics) : cfg.faintestMagnitude

    // Observer near another star: move the vantage there and tell the camera where things are.
    const star = vantage.kind === 'star' && pov === 'vantage' ? getStarVantage(vantage.id) : undefined
    const index = star && buffers ? buffers.names[star.hygName] : undefined
    const exo = vantage.kind === 'exoplanet' && pov === 'vantage' ? getExoplanet(vantage.id) : undefined
    if (exo) {
      // Catalog position when the host is in HYG (else its own point would shine as a second star
      // ~1,000 AU away); archive RA/Dec/distance otherwise (TRAPPIST-1 is too faint for HYG).
      const hostIndex = exo.host.hygName && buffers ? buffers.names[exo.host.hygName] : undefined
      if (buffers && hostIndex !== undefined) {
        const p = buffers.positions3d
        uniforms.uVantage.value.set(p[hostIndex * 3] ?? 0, p[hostIndex * 3 + 1] ?? 0, p[hostIndex * 3 + 2] ?? 0)
      } else {
        const [x, y, z] = hostEquatorialPc(exo.host)
        uniforms.uVantage.value.set(...eqjToScene([x * cfg.unitsPerParsec, y * cfg.unitsPerParsec, z * cfg.unitsPerParsec]))
      }
      starView.sunDir.copy(uniforms.uVantage.value).negate().normalize()
      exoplanetStanding(starView.sunDir, exoplanetsConfig.view, exoUp, starView.starDir)
      starView.up = exoUp
      starView.sunDistancePc = uniforms.uVantage.value.length() / cfg.unitsPerParsec
      starView.starName = exo.host.name
      starView.color = temperatureToRgb(exo.host.teffK)
      sim.starView = starView
      const v = uniforms.uVantage.value
      const auPerUnit = AU_PER_PARSEC / cfg.unitsPerParsec
      liveStarVantage.observerEclAu = [v.x * auPerUnit, -v.z * auPerUnit, v.y * auPerUnit]
      liveStarVantage.sunDistancePc = starView.sunDistancePc
    } else if (star && buffers && index !== undefined) {
      starView.up = null
      const p = buffers.positions3d
      uniforms.uVantage.value.set(p[index * 3] ?? 0, p[index * 3 + 1] ?? 0, p[index * 3 + 2] ?? 0)
      starView.sunDir.copy(uniforms.uVantage.value).negate().normalize()
      // The observer sits between the star and the Sun, looking at the star with the Sun behind.
      starView.starDir.copy(starView.sunDir).negate()
      starView.sunDistancePc = uniforms.uVantage.value.length() / cfg.unitsPerParsec
      starView.starName = star.name
      starView.color = [buffers.colors[index * 3] ?? 1, buffers.colors[index * 3 + 1] ?? 1, buffers.colors[index * 3 + 2] ?? 1]
      sim.starView = starView
      // Scene axes -> ecliptic (inverse of eclToScene), parsecs-in-units -> AU.
      const v = uniforms.uVantage.value
      const auPerUnit = AU_PER_PARSEC / cfg.unitsPerParsec
      liveStarVantage.observerEclAu = [v.x * auPerUnit, -v.z * auPerUnit, v.y * auPerUnit]
      liveStarVantage.sunDistancePc = starView.sunDistancePc
    } else {
      uniforms.uVantage.value.set(0, 0, 0)
      sim.starView = null
      liveStarVantage.observerEclAu = null
    }
  })

  const hidden = useSpaceStore((s) => s.pov === 'scaleJump' && s.scaleJumpLevel === 'localGroup')
  if (!buffers || hidden) return null
  return (
    <>
      <MilkyWayBand />
      <points frustumCulled={false} renderOrder={-1} raycast={() => null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[buffers.positions3d, 3]} />
          <bufferAttribute attach="attributes-absmag" args={[buffers.absMags, 1]} />
          <bufferAttribute attach="attributes-color" args={[buffers.colors, 3]} />
        </bufferGeometry>
        <shaderMaterial
          vertexShader={vertex}
          fragmentShader={fragment}
          uniforms={uniforms}
          vertexColors
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </points>
      <GalacticPlane />
      <VantageStar />
    </>
  )
}

const bandVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * vec4(position * ${cfg.sphereRadius.toFixed(1)} * 0.9 + cameraPosition, 1.0);
    #include <logdepthbuf_vertex>
  }
`
const bandFragment = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uNgp;
  uniform vec3 uGc;
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    #include <logdepthbuf_fragment>
    vec3 d = normalize(vDir);
    float b = asin(clamp(dot(d, uNgp), -1.0, 1.0));
    float l = acos(clamp(dot(normalize(d - uNgp * dot(d, uNgp)), uGc), -1.0, 1.0));
    // Thin disc band, brighter toward the bulge in Sagittarius, with clumpy star clouds and a dust lane.
    float band = exp(-pow(b / 0.16, 2.0)) * (0.35 + 0.65 * exp(-pow(l / 0.9, 2.0)));
    float clouds = 0.55 + 0.45 * noise(d * 18.0) * noise(d * 41.0 + 3.0);
    float dust = 1.0 - 0.55 * exp(-pow(b / 0.03, 2.0)) * noise(d * 25.0 + 7.0);
    float a = band * clouds * dust * uIntensity;
    gl_FragColor = vec4(uColor * a, a);
    #include <colorspace_fragment>
  }
`

/** Diffuse Milky Way glow along the galactic plane (procedural; no texture to misalign). */
function MilkyWayBand() {
  const uniforms = useMemo(
    () => ({ uNgp: { value: NGP }, uGc: { value: GC }, uColor: { value: new Color(cfg.milkyWayColor) }, uIntensity: { value: cfg.milkyWayIntensity } }),
    [],
  )
  const sim = useSim()
  useFrame(() => {
    uniforms.uIntensity.value = cfg.milkyWayIntensity * (1 - sim.galacticMix)
  })
  return (
    <mesh frustumCulled={false} renderOrder={-2} raycast={() => null}>
      <sphereGeometry args={[1, 64, 32]} />
      <shaderMaterial vertexShader={bandVertex} fragmentShader={bandFragment} uniforms={uniforms} side={BackSide} transparent depthWrite={false} blending={AdditiveBlending} />
    </mesh>
  )
}

const GRID_RADIUS = cfg.galacticCenterLabelPc * cfg.unitsPerParsec
const GRID = { radials: 12, circles: 6, divisions: 96 }

/** Faint polar grid in the galactic plane, centred on the Sun, shown only in the Milky Way view. */
function GalacticPlane() {
  const visible = useSpaceStore((s) => s.pov === 'scaleJump' && s.scaleJumpLevel === 'galactic')
  const quaternion = useMemo(() => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), NGP), [])
  const color = useMemo(() => new Color(getComputedStyle(document.documentElement).getPropertyValue('--color-signal').trim()), [])
  if (!visible) return null
  return (
    <polarGridHelper
      args={[GRID_RADIUS, GRID.radials, GRID.circles, GRID.divisions, color, color]}
      quaternion={quaternion}
      material-transparent
      material-opacity={0.12}
      material-depthWrite={false}
      raycast={() => null}
    />
  )
}

const SOLAR_RADIUS_KM = 695_700
const unitsPerKm = sceneConfig.scaleModes.true.unitsPerKm

/** The star you are visiting, as a glowing disc at its real angular size and colour. */
function VantageStar() {
  const sim = useSim()
  const vantage = useSpaceStore((s) => (s.pov === 'vantage' && (s.vantage.kind === 'star' || s.vantage.kind === 'exoplanet') ? s.vantage : null))
  // Floating near a star, or standing on one of its planets: the disc at its true distance and size.
  const exo = vantage?.kind === 'exoplanet' ? getExoplanet(vantage.id) : undefined
  const near = vantage?.kind === 'star' ? getStarVantage(vantage.id) : undefined
  const star = exo ? { distanceAu: exo.planet.semiMajorAu, radiusSolar: exo.host.radiusSolar } : near && { distanceAu: near.vantageDistanceAu, radiusSolar: near.radiusSolar }
  const group = useRef<Group>(null)
  // R3F copies a `color` prop into the material once, so the per-frame colour goes onto the materials.
  const disc = useRef<MeshBasicMaterial>(null)
  const glow = useRef<MeshBasicMaterial>(null)
  useFrame(({ camera }) => {
    const view = sim.starView
    if (!star || !group.current || !view) return
    // temperatureToRgb gives display (sRGB) values; read as linear they wash a red giant out to white.
    disc.current?.color.setRGB(...view.color, 'srgb')
    glow.current?.color.setRGB(...view.color, 'srgb')
    group.current.position.copy(camera.position).addScaledVector(view.starDir, star.distanceAu * KM_PER_AU * unitsPerKm)
  })
  if (!star) return null
  const radius = star.radiusSolar * SOLAR_RADIUS_KM * unitsPerKm
  return (
    <group ref={group}>
      <mesh scale={radius} raycast={() => null}>
        <sphereGeometry args={[1, 48, 24]} />
        <meshBasicMaterial ref={disc} toneMapped={false} />
      </mesh>
      <mesh scale={radius * cfg.vantageStarGlowScale} raycast={() => null}>
        <sphereGeometry args={[1, 48, 24]} />
        <meshBasicMaterial ref={glow} transparent opacity={cfg.vantageStarGlowOpacity} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}