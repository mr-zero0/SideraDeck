import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import {
  AdditiveBlending,
  BackSide,
  Color,
  DataTexture,
  DoubleSide,
  Group,
  RingGeometry,
  SRGBColorSpace,
  Vector3,
  type Texture,
  MathUtils,
  PerspectiveCamera,
} from 'three'
import { rootBody, sceneConfig } from '../../config'
import { hiResPath, isConstrainedDevice } from '../../lib/device'
import { bodyOrientation } from '../../lib/ephemeris'
import { scaleRadiusKm } from '../../lib/scale'
import type { CelestialBody } from '../../schemas/celestial'
import { useSpaceStore } from '../../store/useSpaceStore'
import { ErrorBoundary } from '../ErrorBoundary'
import { atmosphereShader, ringShader, scatterSkyShader, skyShader, surfaceShader } from './shaders'
import { useSim } from './simContext'

const { lighting, geometry } = sceneConfig
const MS_PER_HOUR = 3_600_000
// Hi-res maps need GPU support for their size: 8192 px on desktop, 4096 px for the phone copies.
const HIRES_TEXTURE_PX = isConstrainedDevice ? 4096 : 8192
const SKY_STEPS = isConstrainedDevice ? sceneConfig.quality.phoneSkySteps : sceneConfig.quality.skySteps
export const SKY_DEFINES = { VIEW_STEPS: SKY_STEPS.view, LIGHT_STEPS: SKY_STEPS.light }
const _toBody = new Vector3()
const _forward = new Vector3()

type SunDir = { value: Vector3 }

function solidTexture(hex: string): DataTexture {
  const c = new Color(hex)
  const t = new DataTexture(new Uint8Array([c.r * 255, c.g * 255, c.b * 255, 255]), 1, 1)
  t.colorSpace = SRGBColorSpace
  t.needsUpdate = true
  return t
}

function useSelect(id: string) {
  const select = useSpaceStore((s) => s.select)
  return (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    select(id)
  }
}

function SurfaceMesh({ body, map, night, sunDir, segments = geometry.sphereSegments }: { body: CelestialBody; map: Texture; night?: Texture | undefined; sunDir: SunDir; segments?: number }) {
  const onClick = useSelect(body.id)
  const uniforms = useMemo(
    () => ({
      uMap: { value: map },
      uNight: { value: night ?? null },
      uSunDir: sunDir,
      uAmbient: { value: lighting.ambient },
      uSunIntensity: { value: lighting.sunIntensity },
      uSoftness: { value: lighting.terminatorSoftness },
      uNightIntensity: { value: lighting.nightLightsIntensity },
    }),
    [map, night, sunDir],
  )
  return (
    <mesh onClick={onClick} name={body.id}>
      <sphereGeometry args={[1, segments, segments / 2]} />
      {body.render.emissive ? (
        <meshBasicMaterial map={map} toneMapped={false} />
      ) : (
        <shaderMaterial
          vertexShader={surfaceShader.vertex}
          fragmentShader={surfaceShader.fragment}
          uniforms={uniforms}
          defines={night ? { USE_NIGHT: '' } : {}}
        />
      )}
    </mesh>
  )
}

/** Frees an 8K texture set when the body shrinks back on screen (each map is ~180 MB of GPU memory). */
function useReleaseOnUnmount(urls: string[], textures: Texture[], active: boolean) {
  useEffect(() => {
    if (!active) return
    return () => {
      textures.forEach((t) => t.dispose())
      useTexture.clear(urls)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- release exactly what was loaded on unmount
  }, [])
}

function TexturedSurface({ body, sunDir, hiRes = false }: { body: CelestialBody; sunDir: SunDir; hiRes?: boolean }) {
  const hr = hiRes ? body.render.hiRes : undefined
  const albedoMap = hr ? hiResPath(hr.albedoMap) : body.render.albedoMap
  const nightMap = hr?.nightMap ? hiResPath(hr.nightMap) : body.render.nightMap
  const urls = nightMap ? [albedoMap, nightMap] : [albedoMap]
  const maxAniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  const textures = useTexture(urls, (ts) => {
    for (const t of ts) {
      t.colorSpace = SRGBColorSpace
      t.anisotropy = maxAniso
    }
  })
  useReleaseOnUnmount(urls, textures, Boolean(hr))
  const [map, night] = textures
  if (!map) return null
  return <SurfaceMesh body={body} map={map} night={night} sunDir={sunDir} segments={hr ? sceneConfig.quality.hiResSphereSegments : geometry.sphereSegments} />
}

function Clouds({ body, sunDir, hiRes = false }: { body: CelestialBody; sunDir: SunDir; hiRes?: boolean }) {
  const clouds = body.render.clouds
  const hrCloud = hiRes ? body.render.hiRes?.cloudsMap : undefined
  const hrUrl = hrCloud ? hiResPath(hrCloud) : undefined
  const url = hrUrl ?? clouds?.map ?? body.render.albedoMap
  const maxAniso = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  const map = useTexture(url, (t) => {
    t.anisotropy = maxAniso
  })
  useReleaseOnUnmount([url], [map], Boolean(hrUrl))
  const sim = useSim()
  const ref = useRef<Group>(null)
  const uniforms = useMemo(
    () => ({
      uMap: { value: map },
      uNight: { value: null },
      uSunDir: sunDir,
      uAmbient: { value: lighting.ambient },
      uSunIntensity: { value: lighting.sunIntensity },
      uSoftness: { value: lighting.terminatorSoftness },
      uNightIntensity: { value: 0 },
    }),
    [map, sunDir],
  )
  useFrame(() => {
    if (ref.current && clouds) ref.current.rotation.y = ((sim.date.getTime() / MS_PER_HOUR) * clouds.driftDegPerHour * Math.PI) / 180
  })
  if (!clouds) return null
  const shell = Math.max(1 + clouds.altitudeKm / body.telemetry.radiusKm, lighting.cloudMinShellScale)
  return (
    <group ref={ref} scale={shell}>
      <mesh raycast={() => null}>
        <sphereGeometry args={hrUrl ? [1, sceneConfig.quality.hiResSphereSegments, sceneConfig.quality.hiResSphereSegments / 2] : [1, geometry.sphereSegments, geometry.sphereSegments / 2]} />
        <shaderMaterial
          vertexShader={surfaceShader.vertex}
          fragmentShader={surfaceShader.fragment}
          uniforms={uniforms}
          defines={{ CLOUD_LAYER: '' }}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

function Ring({ body, sunDir, center, radius, hiRes = false }: { body: CelestialBody; sunDir: SunDir; center: Vector3; radius: number; hiRes?: boolean }) {
  const ring = body.render.ring
  const hrRing = hiRes ? body.render.hiRes?.ringMap : undefined
  const hrUrl = hrRing ? hiResPath(hrRing) : undefined
  const url = hrUrl ?? ring?.map ?? body.render.albedoMap
  const map = useTexture(url, (t) => {
    t.colorSpace = SRGBColorSpace
  })
  useReleaseOnUnmount([url], [map], Boolean(hrUrl))
  const geo = useMemo(() => {
    if (!ring) return null
    const inner = ring.innerRadiusKm / body.telemetry.radiusKm
    const outer = ring.outerRadiusKm / body.telemetry.radiusKm
    const g = new RingGeometry(inner, outer, geometry.ringSegments, 1)
    // RingGeometry UVs are planar; the ring texture is a radial strip, so map u to radius.
    const pos = g.attributes.position
    const uv = g.attributes.uv
    if (pos && uv) {
      for (let i = 0; i < pos.count; i++) {
        const r = Math.hypot(pos.getX(i), pos.getY(i))
        uv.setXY(i, (r - inner) / (outer - inner), 0.5)
      }
    }
    return g
  }, [ring, body.telemetry.radiusKm])
  const uniforms = useMemo(
    () => ({
      uMap: { value: map },
      uSunDir: sunDir,
      uPlanetCenter: { value: center },
      uPlanetRadius: { value: radius },
      uAmbient: { value: lighting.ambient },
      uSunIntensity: { value: lighting.sunIntensity },
    }),
    [map, sunDir, center, radius],
  )
  if (!geo) return null
  return (
    <mesh geometry={geo} rotation-x={-Math.PI / 2} raycast={() => null}>
      <shaderMaterial
        vertexShader={ringShader.vertex}
        fragmentShader={ringShader.fragment}
        uniforms={uniforms}
        side={DoubleSide}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}

function Atmosphere({ body, sunDir, radius }: { body: CelestialBody; sunDir: SunDir; radius: number }) {
  const atm = body.render.atmosphere
  const uniforms = useMemo(
    () =>
      atm && {
        uColor: { value: new Color(atm.color) },
        uSunDir: sunDir,
        uIntensity: { value: atm.intensity },
        uPower: { value: atm.power },
        uSoftness: { value: lighting.terminatorSoftness },
        uForwardColor: { value: new Color(atm.forwardColor ?? atm.color) },
        uForwardIntensity: { value: atm.forwardIntensity ?? 0 },
      },
    [atm, sunDir],
  )
  if (!atm || !uniforms) return null
  return (
    <mesh scale={radius * atm.scale} raycast={() => null}>
      <sphereGeometry args={[1, geometry.sphereSegments, geometry.sphereSegments / 2]} />
      <shaderMaterial
        vertexShader={atmosphereShader.vertex}
        fragmentShader={atmosphereShader.fragment}
        uniforms={uniforms}
        defines={body.render.emissive ? { SELF_LIT: '' } : {}}
        blending={AdditiveBlending}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}

function SkyDome({ body, sunDir, center, radius }: { body: CelestialBody; sunDir: SunDir; center: Vector3; radius: number }) {
  const atm = body.render.atmosphere
  const sky = sceneConfig.skies.bodies[body.id]
  const active = useSpaceStore((s) => s.pov === 'vantage' && s.vantage.kind === 'body' && s.vantage.id === body.id)
  const uniforms = useMemo(() => {
    if (sky) {
      return {
        uSunDir: sunDir,
        uCenter: { value: center },
        uUnitsPerKm: { value: sceneConfig.scaleModes.true.unitsPerKm },
        uPlanetR: { value: body.telemetry.radiusKm },
        uAtmR: { value: body.telemetry.radiusKm + sky.thicknessKm },
        uRay: { value: new Vector3(...sky.rayleigh) },
        uHR: { value: sky.rayleighHeightKm },
        uMie: { value: new Vector3(...sky.mie) },
        uHM: { value: sky.mieHeightKm },
        uG: { value: sky.mieG },
        uSunI: { value: sky.sunIntensity },
        uSunColor: { value: new Vector3(1, 1, 1) },
        uFwd: { value: new Vector3(...(sky.forwardTint ?? [1, 1, 1])) },
      }
    }
    return atm && { uColor: { value: new Color(atm.color) }, uSunDir: sunDir, uCenter: { value: center }, uSoftness: { value: lighting.terminatorSoftness } }
  }, [atm, sky, sunDir, center, body.telemetry.radiusKm])
  const sim = useSim()
  useFrame(() => {
    // During an eclipse the whole sky darkens with the covered fraction of the Sun.
    if (sky && uniforms && 'uSunI' in uniforms) uniforms.uSunI.value = sky.sunIntensity * sim.sunlight
  })
  if (!active || !uniforms) return null
  const shader = sky ? scatterSkyShader : skyShader
  return (
    <mesh scale={radius * sceneConfig.vantage.skyDomeScale} raycast={() => null} renderOrder={1}>
      <sphereGeometry args={[1, geometry.sphereSegments, geometry.sphereSegments / 2]} />
      <shaderMaterial
        vertexShader={shader.vertex}
        fragmentShader={shader.fragment}
        uniforms={uniforms}
        side={BackSide}
        transparent
        depthWrite={false}
        {...(sky ? { blending: AdditiveBlending, defines: SKY_DEFINES } : {})}
      />
    </mesh>
  )
}
/** Isolates each optional texture layer so one missing file never blanks the body. */
const Layer = ({ label, fallback = null, children }: { label: string; fallback?: ReactNode; children: ReactNode }) => (
  <ErrorBoundary label={label} fallback={fallback}>
    <Suspense fallback={fallback}>{children}</Suspense>
  </ErrorBoundary>
)

export function CelestialBodyMesh({ body }: { body: CelestialBody }) {
  const sim = useSim()
  const scaleMode = useSpaceStore((s) => s.scaleMode)
  const radius = scaleRadiusKm(body.telemetry.radiusKm, scaleMode, sceneConfig)
  const groupRef = useRef<Group>(null)
  const spinRef = useRef<Group>(null)
  const sunDir = useMemo<SunDir>(() => ({ value: new Vector3(1, 0, 0) }), [])
  const center = useMemo(() => new Vector3(), [])
  const fallback = useMemo(() => solidTexture(body.render.fallbackColor), [body.render.fallbackColor])
  const [hiRes, setHiRes] = useState(false)
  const canHiRes = useThree((s) => s.gl.capabilities.maxTextureSize >= HIRES_TEXTURE_PX) && Boolean(body.render.hiRes)
  const height = useThree((s) => s.size.height)

  useFrame(({ camera }) => {
    const p = sim.positions.get(body.id)
    const sun = sim.positions.get(rootBody.id)
    if (!p || !sun || !groupRef.current || !spinRef.current) return
    groupRef.current.position.set(p[0], p[1], p[2])
    bodyOrientation(body, sim.date, spinRef.current.quaternion)
    if (body.id !== rootBody.id) sunDir.value.set(sun[0] - p[0], sun[1] - p[1], sun[2] - p[2]).normalize()
    groupRef.current.getWorldPosition(center)
    if (!canHiRes || !(camera instanceof PerspectiveCamera)) return
    // Load 8K maps only while the disc is large on screen (hysteresis avoids flapping), and never for
    // the world you stand on: the terrain patch covers it.
    const st = useSpaceStore.getState()
    const standingHere = st.pov === 'vantage' && st.vantage.kind === 'body' && st.vantage.id === body.id
    const dist = Math.max(camera.position.distanceTo(center), radius)
    const radiusPx = (radius / dist) * (height / 2 / Math.tan(MathUtils.degToRad(camera.fov) / 2))
    // Only while actually in view: a big disc behind you (the Sun from the Moon) must not load 8K maps.
    _toBody.copy(center).sub(camera.position).normalize()
    camera.getWorldDirection(_forward)
    const inView = _toBody.angleTo(_forward) < MathUtils.degToRad(camera.fov * camera.aspect) + Math.asin(Math.min(1, radius / dist))
    const want = !standingHere && inView && (hiRes ? radiusPx > sceneConfig.quality.hiResOffPx : radiusPx > sceneConfig.quality.hiResOnPx)
    if (want !== hiRes) setHiRes(want)
  })

  const fallbackSurface = <SurfaceMesh body={body} map={fallback} sunDir={sunDir} />
  // While an 8K map streams in (or if it fails), keep showing the 2K one.
  const sharp = (low: ReactNode, high: ReactNode) =>
    hiRes ? (
      <ErrorBoundary label={`${body.id}:hires`} fallback={low}>
        <Suspense fallback={low}>{high}</Suspense>
      </ErrorBoundary>
    ) : (
      low
    )

  return (
    <group ref={groupRef}>
      <group ref={spinRef} scale={radius}>
        <Layer label={`${body.id}:surface`} fallback={fallbackSurface}>
          {sharp(<TexturedSurface body={body} sunDir={sunDir} />, <TexturedSurface body={body} sunDir={sunDir} hiRes />)}
        </Layer>
        {body.render.clouds && (
          <Layer label={`${body.id}:clouds`}>
            {sharp(<Clouds body={body} sunDir={sunDir} />, <Clouds body={body} sunDir={sunDir} hiRes />)}
          </Layer>
        )}
        {body.render.ring && (
          <Layer label={`${body.id}:ring`}>
            {sharp(<Ring body={body} sunDir={sunDir} center={center} radius={radius} />, <Ring body={body} sunDir={sunDir} center={center} radius={radius} hiRes />)}
          </Layer>
        )}
      </group>
      <Atmosphere body={body} sunDir={sunDir} radius={radius} />
      <SkyDome body={body} sunDir={sunDir} center={center} radius={radius} />
    </group>
  )
}
