import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BackSide, Mesh, Vector3 } from 'three'
import { getBody, getExoplanet, sceneConfig } from '../../config'
import { temperatureToRgb } from '../../lib/starfield'
import { useSpaceStore } from '../../store/useSpaceStore'
import { SKY_DEFINES } from './CelestialBodyMesh'
import { scatterSkyShader } from './shaders'
import { useSim } from './simContext'
import type { Exoplanet } from '../../schemas/explore'

const UNITS_PER_KM = sceneConfig.scaleModes.true.unitsPerKm
const EARTH_RADIUS_KM = getBody(sceneConfig.vantage.earthId).telemetry.radiusKm

function Sky({ ex }: { ex: Exoplanet }) {
  const sim = useSim()
  const mesh = useRef<Mesh>(null)
  const sky = ex.illustrative.sky
  const radiusKm = ex.planet.radiusEarth * EARTH_RADIUS_KM
  const uniforms = useMemo(
    () => ({
      uSunDir: { value: new Vector3(0, 1, 0) },
      uCenter: { value: new Vector3() },
      uUnitsPerKm: { value: UNITS_PER_KM },
      uPlanetR: { value: radiusKm },
      uAtmR: { value: radiusKm + sky.thicknessKm },
      uRay: { value: new Vector3(...sky.rayleigh) },
      uHR: { value: sky.rayleighHeightKm },
      uMie: { value: new Vector3(...sky.mie) },
      uHM: { value: sky.mieHeightKm },
      uG: { value: sky.mieG },
      // Illustrative: a red dwarf gives far less visible light than the Sun at the same warmth.
      uSunI: { value: sky.sunIntensity * ex.illustrative.visibleLight },
      uSunColor: { value: new Vector3(...temperatureToRgb(ex.host.teffK)) },
      uFwd: { value: new Vector3(...(sky.forwardTint ?? [1, 1, 1])) },
    }),
    [ex, sky, radiusKm],
  )
  useFrame(() => {
    const g = sim.ground
    const view = sim.starView
    if (!g || !view || !mesh.current) return
    // Camera at the origin: the planet's centre is straight down, one radius plus eye height away.
    uniforms.uCenter.value.copy(g.localUp).multiplyScalar(-(radiusKm * 1000 + g.eyeAboveSphereM) * g.unitsPerM)
    uniforms.uSunDir.value.copy(view.starDir)
    mesh.current.position.copy(uniforms.uCenter.value)
  })
  return (
    <mesh ref={mesh} scale={radiusKm * UNITS_PER_KM * sceneConfig.vantage.skyDomeScale} raycast={() => null} renderOrder={1}>
      <sphereGeometry args={[1, sceneConfig.geometry.sphereSegments, sceneConfig.geometry.sphereSegments / 2]} />
      <shaderMaterial
        vertexShader={scatterSkyShader.vertex}
        fragmentShader={scatterSkyShader.fragment}
        uniforms={uniforms}
        side={BackSide}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        defines={SKY_DEFINES}
      />
    </mesh>
  )
}

/** Illustrative atmosphere over an exoplanet landing, lit by its host star. */
export function ExoplanetSky() {
  const id = useSpaceStore((s) => (s.pov === 'vantage' && s.vantage.kind === 'exoplanet' ? s.vantage.id : null))
  const ex = id ? getExoplanet(id) : undefined
  return ex ? <Sky key={ex.id} ex={ex} /> : null
}
