import { useMemo, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import { registry, sceneConfig } from '../../config'
import { computeScenePositions } from '../../lib/ephemeris'
import { isConstrainedDevice } from '../../lib/device'
import { simDateNow, useSpaceStore } from '../../store/useSpaceStore'
import { BodyLabelLayer, BodyLabelProjector } from './BodyLabels'
import { BodyPoints } from './BodyPoints'
import { CameraRig } from './CameraRig'
import { SnapshotBridge } from './SnapshotBridge'
import { IdentifyLayer } from './IdentifyLayer'
import { CraftModel } from './CraftModel'
import { LocalGroup } from './LocalGroup'
import { Spacecraft } from './Spacecraft'
import { SunGlare } from './SunGlare'
import { TerrainPatch } from './TerrainPatch'
import { ExoplanetSky } from './ExoplanetSky'
import { CelestialBodyMesh } from './CelestialBodyMesh'
import { OrbitPaths } from './OrbitPaths'
import { RealStarfield } from './RealStarfield'
import { FRAME_PRIORITY, SimContext, frameStats, type SimFrame } from './simContext'

const cam = sceneConfig.camera

// Exponential moving average weight for the FPS readout.
const FPS_SMOOTHING = 0.05

function Ephemeris({ sim }: { sim: SimFrame }) {
  useFrame(({ gl }, delta) => {
    sim.date = simDateNow()
    sim.positions = computeScenePositions(registry.bodies, sim.date, useSpaceStore.getState().scaleMode, sceneConfig)
    // gl.info still holds the previous frame here (it resets at the start of each render).
    if (delta > 0) frameStats.fps += (1 / delta - frameStats.fps) * FPS_SMOOTHING
    frameStats.drawCalls = gl.info.render.calls
    frameStats.triangles = gl.info.render.triangles
  }, FRAME_PRIORITY.ephemeris)
  return null
}

export function SpaceScene() {
  const [contextLost, setContextLost] = useState(false)
  const sim = useMemo<SimFrame>(() => {
    const date = simDateNow()
    return {
      date,
      positions: computeScenePositions(registry.bodies, date, useSpaceStore.getState().scaleMode, sceneConfig),
      world: { current: null },
      focusId: useSpaceStore.getState().selectedBodyId,
      galacticMix: 0,
      localGroupFocus: new Vector3(),
      starView: null,
      ground: null,
      daylight: 0,
      sunlight: 1,
      stars: null,
      labels: new Map(),
    }
  }, [])

  if (contextLost) {
    return (
      <div role="alert" className="grid h-full place-items-center text-sm text-ink-muted">
        <div className="flex flex-col items-center gap-3">
          <p>The graphics context was lost (GPU reset or driver update).</p>
          <button type="button" onClick={() => window.location.reload()} className="hud-button">
            Reload view
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Canvas
      aria-label="3D view of the Solar System"
      dpr={[1, isConstrainedDevice ? sceneConfig.quality.phoneMaxDpr : sceneConfig.quality.maxDpr]}
      gl={{ logarithmicDepthBuffer: true, antialias: true, powerPreference: 'high-performance' }}
      // The camera rig owns every gesture (drag, pinch); stop the browser scrolling or zooming the page.
      style={{ touchAction: 'none' }}
      camera={{ fov: cam.fovDeg, near: cam.near, far: cam.far, position: [0, 0, 1] }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          setContextLost(true)
        })
      }}
    >
      <SimContext.Provider value={sim}>
        <Ephemeris sim={sim} />
        <RealStarfield />
        <group ref={sim.world}>
          <OrbitPaths />
          <BodyPoints />
          <CraftModel />
          {registry.bodies.map((b) => (
            <CelestialBodyMesh key={b.id} body={b} />
          ))}
        </group>
        <TerrainPatch />
        <ExoplanetSky />
        <SunGlare />
        <Spacecraft />
        <LocalGroup />
        <CameraRig />
        <BodyLabelProjector />
        <SnapshotBridge />
        <IdentifyLayer />
      </SimContext.Provider>
    </Canvas>
    <BodyLabelLayer labels={sim.labels} />
    </>
  )
}
