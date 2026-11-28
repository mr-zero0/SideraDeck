import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { MathUtils, Matrix4, PerspectiveCamera, Quaternion, Vector2, Vector3, type Camera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { galaxiesConfig, getBody, getExoplanet, registry, rootBody, sceneConfig } from '../../config'
import { bodyOrientation } from '../../lib/ephemeris'
import { scaleDistanceAu, scaleRadiusKm } from '../../lib/scale'
import { craftRadiusUnits } from '../../lib/spacecraft'
import { terrainHeightM } from '../../lib/terrain'
import { latLonToLocal, rotateLook, standingNormal } from '../../lib/vantage'
import { sunlightFraction } from '../../lib/eclipse'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { craftKey, useSpaceStore } from '../../store/useSpaceStore'
import type { ScaleMode } from '../../schemas/scene'
import { LOCAL_GROUP, localGroupFocus } from './LocalGroup'
import { FRAME_PRIORITY, VANTAGE_STAR_TARGET, skyTap, useSim, walkInput, type Ground, type SimFrame } from './simContext'

const cam = sceneConfig.camera
const { scaleJump } = sceneConfig.pov
const { vantage: vantageCfg, optics } = sceneConfig
const UP = new Vector3(0, 1, 0)
const DEG = Math.PI / 180
const OVERVIEW_ELEVATION = 0.8
const GALAXY_FRAME_MULTIPLE = 2.2
// Pointer travel below this is a tap (identify), not a drag (look around).
const TAP_SLOP_PX = 8
// Closest zoom in the Local Group view, as a fraction of the framing distance.
const LG_MIN_DISTANCE_FRACTION = 0.05

type FramingDir = 'lit' | 'keep' | 'overview'
type Rig = {
  lastKey: string | null
  lastMode: string | null
  focusSnap: boolean
  /** null = the user owns the camera; otherwise ease toward a framing. */
  framing: { dir: FramingDir; snap: boolean } | null
  /** First person: standing point as a body-fixed surface normal, so the ground turns with the planet. */
  standLocal: Vector3 | null
  look: Vector3
  up: Vector3
  anchor: Vector3
  east: Vector3
  south: Vector3
  /** Metres walked from the entry point: x east, y south. */
  walk: Vector2
  keys: Set<string>
  basis: Matrix4
  ground: Ground
}

type Scratch = { focus: Vector3; target: Vector3; sun: Vector3; dir: Vector3; side: Vector3; off: Vector3; q: Quaternion; n: Vector3; lg: Vector3 }

/**
 * Orbital, scale-jump and first-person cameras with a floating origin: the focus is always at
 * (0,0,0) and the world group is shifted by -focus, so true-scale distances keep float32 precision.
 */
export function CameraRig() {
  const sim = useSim()
  const gl = useThree((s) => s.gl)
  const controls = useRef<OrbitControlsImpl>(null)
  const reduced = useReducedMotion()
  const pov = useSpaceStore((s) => s.pov)
  const rig = useRef<Rig>({
    lastKey: null,
    lastMode: null,
    focusSnap: true,
    framing: null,
    standLocal: null,
    look: new Vector3(0, 0, -1),
    up: UP.clone(),
    anchor: new Vector3(),
    east: new Vector3(),
    south: new Vector3(),
    walk: new Vector2(),
    keys: new Set(),
    basis: new Matrix4(),
    ground: { bodyId: '', localUp: new Vector3(0, 1, 0), quaternion: new Quaternion(), walkX: 0, walkZ: 0, eyeAboveSphereM: 0, radiusM: 1, unitsPerM: 1, terrain: false, sunDir: new Vector3(), earthDir: new Vector3() },
  })
  const v = useMemo<Scratch>(
    () => ({ focus: new Vector3(), target: new Vector3(), sun: new Vector3(), dir: new Vector3(), side: new Vector3(), off: new Vector3(), q: new Quaternion(), n: new Vector3(), lg: new Vector3() }),
    [],
  )

  // First person: drag to look around (grab-the-sky), wheel or pinch to zoom the optics, tap to identify.
  useEffect(() => {
    if (pov !== 'vantage') return
    const el = gl.domElement
    const pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>()
    let dragging = false
    let pinch: { dist: number; fov: number } | null = null
    const spread = () => {
      const [a, b] = [...pointers.values()]
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
    }
    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY })
      el.setPointerCapture(e.pointerId)
      if (pointers.size === 2) pinch = { dist: spread(), fov: useSpaceStore.getState().fovDeg }
    }
    const move = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId)
      if (!p) return
      const st = useSpaceStore.getState()
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      p.x = e.clientX
      p.y = e.clientY
      if (pinch && pointers.size === 2) {
        const d = spread()
        if (d > 0) st.setFov(pinch.fov * (pinch.dist / d))
        return
      }
      // A small wobble is still a tap; only a real drag takes the camera off its target.
      if (!dragging && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < TAP_SLOP_PX) return
      dragging = true
      // One pixel of drag = one pixel of sky at the current zoom, so telescopes stay controllable.
      const radPerPx = (st.fovDeg * DEG) / el.clientHeight
      rotateLook(rig.current.look, rig.current.up, dx * radPerPx, dy * radPerPx, vantageCfg.maxPitchDeg * DEG)
      if (st.lookTargetId) st.setLookTarget(null)
    }
    const up = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId)
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = null
      if (p && !dragging && pointers.size === 0 && e.type === 'pointerup') {
        const r = el.getBoundingClientRect()
        skyTap.handler?.(((p.startX - r.left) / r.width) * 2 - 1, -(((p.startY - r.top) / r.height) * 2 - 1))
      }
      if (pointers.size === 0) dragging = false
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const st = useSpaceStore.getState()
      st.setFov(st.fovDeg * Math.exp(e.deltaY * optics.wheelZoomPerDeltaY))
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [pov, gl])

  // First person: WASD / arrow keys walk, Shift runs. Ignored while typing in a field.
  useEffect(() => {
    if (pov !== 'vantage') return
    const keys = rig.current.keys
    const typing = (e: KeyboardEvent) => e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')
    const down = (e: KeyboardEvent) => {
      if (!typing(e)) keys.add(e.code)
    }
    const up = (e: KeyboardEvent) => keys.delete(e.code)
    const clear = () => keys.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      keys.clear()
    }
  }, [pov])

  useFrame(({ camera }, delta) => {
    const st = useSpaceStore.getState()
    const k = reduced ? 1 : 1 - Math.exp(-cam.transitionLambda * delta)
    if (st.pov === 'vantage') {
      firstPerson(camera, sim, rig.current, v, reduced ? 1 : 1 - Math.exp(-vantageCfg.trackLambda * delta), delta)
      return
    }
    setFov(camera, cam.fovDeg)
    sim.ground = null
    sim.daylight = 0
    const r = rig.current
    if (r.lastKey?.startsWith('vantage|')) {
      camera.up.copy(UP)
      r.lastKey = null
    }

    const { selectedBodyId: id, scaleMode: mode, pov: p, scaleJumpLevel: level, galaxyFocusId } = st
    const jump = p === 'scaleJump'
    const world = sim.world.current

    if (jump && level === 'localGroup') {
      const key = `lg|${galaxyFocusId ?? ''}`
      const entry = LOCAL_GROUP.find((e) => e.id === galaxyFocusId)
      const desired = entry ? entry.diameter * GALAXY_FRAME_MULTIPLE : galaxiesConfig.cameraDistanceKpc * galaxiesConfig.unitsPerKpc
      if (r.lastKey !== key) {
        r.framing = { dir: 'overview', snap: reduced }
        r.lastKey = key
      }
      localGroupFocus(galaxyFocusId, v.lg)
      sim.localGroupFocus.lerp(v.lg, k)
      if (r.framing) frameOrbit(camera, r, v, desired, false, k)
      if (world) world.visible = false
      setNear(camera, cam.near)
      if (controls.current) controls.current.minDistance = desired * LG_MIN_DISTANCE_FRACTION
      return
    }

    const craftId = !jump ? st.craftFocusId : null
    const focusId = craftId ? craftKey(craftId) : jump && level !== 'planetary' ? rootBody.id : id
    const pos = sim.positions.get(focusId)
    const s = sim.positions.get(rootBody.id)
    if (!pos || !s) return
    const radius = craftId ? craftRadiusUnits(craftId, mode) : scaleRadiusKm(getBody(focusId).telemetry.radiusKm, mode, sceneConfig)
    // Portrait screens have a narrow horizontal field: back off so the body fits the width too.
    const portraitFit = camera instanceof PerspectiveCamera && camera.aspect < 1 ? 1 / camera.aspect : 1
    const desired = (craftId ? radius * cam.orbitDistanceInRadii : desiredDistance(sim.positions, focusId, radius, mode, jump ? level : null)) * portraitFit
    // A 3 m probe at true scale is ~1e-9 units: pull the near plane in with the camera (log depth keeps precision).
    setNear(camera, Math.min(cam.near, camera.position.length() * cam.nearFractionOfDistance))
    v.target.set(pos[0], pos[1], pos[2])
    v.sun.set(s[0] - pos[0], s[1] - pos[1], s[2] - pos[2]).normalize()

    const key = `${focusId}|${p}|${jump ? level : ''}`
    if (r.lastKey !== key) {
      const first = r.lastKey === null
      const instant = first || reduced
      r.focusSnap = instant
      r.framing = { dir: p === 'orbital' ? 'lit' : jump ? 'overview' : 'keep', snap: instant }
      r.lastKey = key
      r.lastMode = mode
    } else if (r.lastMode !== mode) {
      r.focusSnap = true
      r.framing = { dir: 'keep', snap: true }
      r.lastMode = mode
    }
    sim.focusId = focusId

    if (r.focusSnap) v.focus.copy(v.target)
    else {
      v.focus.lerp(v.target, k)
      if (v.focus.distanceTo(v.target) < Math.max(desired, radius) * cam.transitionSettleRatio) r.focusSnap = true
    }
    if (r.framing) frameOrbit(camera, r, v, desired, focusId !== rootBody.id, k)

    if (world) {
      world.position.set(-v.focus.x, -v.focus.y, -v.focus.z)
      // Planets are sub-pixel from the Milky Way view; hide them once the camera is far enough out.
      world.visible = !(jump && level === 'galactic' && camera.position.length() > solarDistance(mode) * 2)
    }
    if (controls.current) controls.current.minDistance = radius * cam.minDistanceInRadii
  }, FRAME_PRIORITY.camera)

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={pov !== 'vantage'}
      enablePan={false}
      enableDamping={!reduced}
      dampingFactor={cam.controls.dampingFactor}
      rotateSpeed={cam.controls.rotateSpeed}
      zoomSpeed={cam.controls.zoomSpeed}
      onStart={() => {
        // The user grabbed the camera: stop auto-framing but keep tracking the body.
        rig.current.framing = null
      }}
    />
  )
}

function setNear(camera: Camera, near: number) {
  if (camera instanceof PerspectiveCamera && camera.near !== near) {
    camera.near = near
    camera.updateProjectionMatrix()
  }
}

function setFov(camera: Camera, fov: number) {
  if (camera instanceof PerspectiveCamera && camera.fov !== fov) {
    camera.fov = fov
    camera.updateProjectionMatrix()
  }
}

/** Direction from the camera to a look target, in world-group-relative coordinates. */
function targetDirection(sim: SimFrame, id: string, camera: Camera, focus: Vector3, out: Vector3): Vector3 | null {
  if (sim.starView) {
    if (id === VANTAGE_STAR_TARGET) return out.copy(sim.starView.starDir)
    if (id === rootBody.id) return out.copy(sim.starView.sunDir)
    return null
  }
  const p = sim.positions.get(id)
  if (!p) return null
  return out.set(p[0] - focus.x, p[1] - focus.y, p[2] - focus.z).sub(camera.position).normalize()
}

const UNITS_PER_M = sceneConfig.scaleModes.true.unitsPerKm / 1000
const POLE = new Vector3(0, 1, 0)
const EARTH_RADIUS_M = getBody(vantageCfg.earthId).telemetry.radiusKm * 1000

/** East at a body-local surface normal (falls back at the poles, where east is undefined). */
function localEast(up: Vector3, out: Vector3): Vector3 {
  out.crossVectors(POLE, up)
  if (out.lengthSq() < 1e-12) out.set(1, 0, 0)
  return out.normalize()
}

const _east = new Vector3()
/** World-space up / east / south at a body-local surface normal, given the body's orientation. */
function tangentFrame(localUp: Vector3, q: Quaternion, up: Vector3, east: Vector3, south: Vector3) {
  up.copy(localUp).applyQuaternion(q)
  east.copy(localEast(localUp, _east)).applyQuaternion(q)
  south.crossVectors(east, up).normalize()
}
const WALK_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
}

/** WASD / arrows / touch pad: moves `r.walk` (metres east, south) relative to where you look. Shift runs. */
function walkStep(r: Rig, east: Vector3, south: Vector3, delta: number): boolean {
  let fx = walkInput.x
  let fz = walkInput.z
  for (const code of r.keys) {
    const d = WALK_KEYS[code]
    if (d) {
      fx += d[0]
      fz += d[1]
    }
  }
  if (!fx && !fz) return false
  const speed = vantageCfg.walkSpeedMs * (r.keys.has('ShiftLeft') || r.keys.has('ShiftRight') ? vantageCfg.runMultiplier : 1) * delta
  // Forward = look direction flattened onto the ground, in the (east, south) frame.
  const lookE = r.look.dot(east)
  const lookS = r.look.dot(south)
  const len = Math.hypot(lookE, lookS) || 1
  const fe = lookE / len
  const fs = lookS / len
  // Right = forward x up = (-fs, fe) in the (east, south) frame.
  r.walk.x += (fe * fz - fs * fx) * speed
  r.walk.y += (fs * fz + fe * fx) * speed
  return true
}

/** Sun elevation -> how much daylight glare washes out stars (none without an atmosphere at night). */
function daylightFactor(sunElevationRad: number, hasSky: boolean): number {
  if (hasSky) return MathUtils.smoothstep(sunElevationRad, -0.1, 0.08)
  return sunElevationRad > 0 ? vantageCfg.airlessGlareStarFade : 0
}

function firstPerson(camera: Camera, sim: SimFrame, r: Rig, v: Scratch, k: number, delta: number) {
  const st = useSpaceStore.getState()
  const vt = st.vantage
  const focusId = vt.kind === 'body' ? vt.id : vt.kind === 'craft' ? craftKey(vt.id) : rootBody.id
  const p = sim.positions.get(focusId)
  const world = sim.world.current
  sim.focusId = focusId
  // Near another star (or on one of its planets) the Solar System is a single point of light.
  if (world) world.visible = vt.kind !== 'star' && vt.kind !== 'exoplanet'
  setFov(camera, st.fovDeg)
  // Eye level: the nearest ground is ~1 m away; the log depth buffer copes with the 1e-12 near plane.
  setNear(camera, vt.kind === 'body' || vt.kind === 'exoplanet' ? UNITS_PER_M * cam.nearFractionOfDistance : cam.near)
  if (!p) return
  camera.position.set(0, 0, 0)

  const key = `vantage|${vt.kind}|${vt.id}|${vt.elevationDeg ?? ''}|${vt.latDeg ?? ''}|${vt.lonDeg ?? ''}`
  const entering = r.lastKey !== key
  if (entering) {
    r.lastKey = key
    r.framing = null
    r.standLocal = null
    r.walk.set(0, 0)
  }

  if (vt.kind === 'body') {
    const body = getBody(vt.id)
    bodyOrientation(body, sim.date, v.q)
    const s = sim.positions.get(rootBody.id)
    v.sun.set(s ? s[0] - p[0] : 1, s ? s[1] - p[1] : 0, s ? s[2] - p[2] : 0).normalize()
    if (!r.standLocal) {
      // Stand where the default target is above the horizon with the Sun set, then stay put.
      const t = sim.positions.get(st.lookTargetId ?? vantageCfg.earthId)
      v.target.set(t ? t[0] - p[0] : 0, t ? t[1] - p[1] : 1, t ? t[2] - p[2] : 0).normalize()
      const inv = v.q.clone().invert()
      if (vt.latDeg !== undefined && vt.lonDeg !== undefined) {
        // A real place on the body (eclipse paths): fixed latitude / longitude.
        r.standLocal = latLonToLocal(vt.latDeg, vt.lonDeg)
      } else {
        const n = standingNormal(
          v.target,
          v.sun,
          (vt.elevationDeg ?? vantageCfg.targetElevationDeg) * DEG,
          vantageCfg.twilightSunDepthDeg * DEG,
          v.n,
          sceneConfig.events.sunTogetherDeg * DEG,
        )
        r.standLocal = n.clone().applyQuaternion(inv)
      }
      // Body-fixed tangent frame at the entry point: X east, Z south (Y is the local up).
      localEast(r.standLocal, r.east)
      r.south.crossVectors(r.east, r.standLocal).normalize()
      r.anchor.copy(r.standLocal)
      r.look.copy(v.target)
    }

    const radiusM = body.telemetry.radiusKm * 1000
    const terrain = !vantageCfg.noTerrainBodyIds.includes(body.id)
    tangentFrame(r.standLocal, v.q, v.n, v.side, v.dir)
    if (walkStep(r, v.side, v.dir, delta)) {
      // shortcut: the terrain frame stays tangent at the entry point; fine for a few km of walking.
      r.standLocal.copy(r.anchor).addScaledVector(r.east, r.walk.x / radiusM).addScaledVector(r.south, r.walk.y / radiusM).normalize()
    }

    const groundM = terrain ? terrainHeightM(r.walk.x, r.walk.y, vantageCfg.terrain.octaves) : 0
    const eyeAboveSphereM = groundM + vantageCfg.eyeHeightM
    tangentFrame(r.standLocal, v.q, v.n, v.side, v.dir)
    r.up.copy(v.n)
    // Camera-centred origin: shift the world so the eye is at (0,0,0); metres and AU then share one float32 scene.
    const radiusUnits = scaleRadiusKm(body.telemetry.radiusKm, 'true', sceneConfig)
    v.focus.set(p[0], p[1], p[2]).addScaledVector(v.n, radiusUnits + eyeAboveSphereM * UNITS_PER_M)

    const earth = sim.positions.get(vantageCfg.earthId)
    const g = r.ground
    g.bodyId = body.id
    g.localUp.copy(r.standLocal)
    g.quaternion.setFromRotationMatrix(r.basis.makeBasis(v.side, v.n, v.dir))
    g.walkX = r.walk.x
    g.walkZ = r.walk.y
    g.eyeAboveSphereM = eyeAboveSphereM
    g.radiusM = radiusM
    g.unitsPerM = UNITS_PER_M
    g.terrain = terrain
    g.sunDir.copy(v.sun)
    if (earth) g.earthDir.set(earth[0] - p[0], earth[1] - p[1], earth[2] - p[2]).normalize()
    sim.ground = g
    // Eclipses: how much of the Sun's disc other bodies hide, seen from the eye (scene units).
    const sunPos = sim.positions.get(rootBody.id)
    const occluders: { vec: number[]; radius: number }[] = []
    for (const b of registry.bodies) {
      const bp = sim.positions.get(b.id)
      if (!bp || b.id === body.id || b.id === rootBody.id) continue
      occluders.push({ vec: [bp[0] - v.focus.x, bp[1] - v.focus.y, bp[2] - v.focus.z], radius: scaleRadiusKm(b.telemetry.radiusKm, 'true', sceneConfig) })
    }
    sim.sunlight = sunPos
      ? sunlightFraction([sunPos[0] - v.focus.x, sunPos[1] - v.focus.y, sunPos[2] - v.focus.z], scaleRadiusKm(rootBody.telemetry.radiusKm, 'true', sceneConfig), occluders)
      : 1
    sim.daylight = daylightFactor(Math.asin(MathUtils.clamp(v.n.dot(v.sun), -1, 1)), Boolean(sceneConfig.skies.bodies[body.id])) * sim.sunlight
  } else if (vt.kind === 'exoplanet' && sim.starView?.up) {
    // Tidally locked and not orbiting here: the ground frame is fixed in the scene.
    const ex = getExoplanet(vt.id)
    const up = sim.starView.up
    v.focus.set(p[0], p[1], p[2])
    if (entering) r.look.copy(sim.starView.starDir)
    localEast(up, v.side)
    v.dir.crossVectors(v.side, up).normalize()
    walkStep(r, v.side, v.dir, delta)
    r.up.copy(up)
    const g = r.ground
    g.bodyId = vt.id
    g.localUp.copy(up)
    g.quaternion.setFromRotationMatrix(r.basis.makeBasis(v.side, up, v.dir))
    g.walkX = r.walk.x
    g.walkZ = r.walk.y
    g.eyeAboveSphereM = terrainHeightM(r.walk.x, r.walk.y, vantageCfg.terrain.octaves) + vantageCfg.eyeHeightM
    g.radiusM = (ex?.planet.radiusEarth ?? 1) * EARTH_RADIUS_M
    g.unitsPerM = UNITS_PER_M
    g.terrain = true
    // The host star lights the ground; the Sun is one more star in the sky.
    g.sunDir.copy(sim.starView.starDir)
    g.earthDir.copy(sim.starView.sunDir)
    sim.ground = g
    sim.sunlight = 1
    sim.daylight = daylightFactor(Math.asin(MathUtils.clamp(up.dot(sim.starView.starDir), -1, 1)), true) * (ex?.illustrative.visibleLight ?? 1)
  } else {
    v.focus.set(p[0], p[1], p[2])
    r.up.copy(UP)
    sim.ground = null
    sim.daylight = 0
    sim.sunlight = 1
  }
  world?.position.set(-v.focus.x, -v.focus.y, -v.focus.z)

  if (st.lookTargetId) {
    const d = targetDirection(sim, st.lookTargetId, camera, v.focus, v.dir)
    if (d) {
      if (entering) r.look.copy(d)
      else r.look.lerp(d, k).normalize()
    }
  }
  camera.up.copy(r.up)
  v.off.copy(r.look)
  camera.lookAt(v.off)
}
function frameOrbit(camera: Camera, r: Rig, v: Scratch, desired: number, lit: boolean, k: number) {
  if (!r.framing) return
  v.off.copy(camera.position)
  const len = v.off.length() || desired
  const dir = r.framing.dir
  if (dir === 'lit' && lit) {
    // Three-quarter view from the sunlit side, so the terminator is in frame.
    v.side.crossVectors(v.sun, UP).normalize()
    const a = MathUtils.degToRad(cam.litViewAngleDeg)
    v.dir.copy(v.sun).multiplyScalar(Math.cos(a)).addScaledVector(v.side, Math.sin(a)).addScaledVector(UP, cam.litViewElevation).normalize()
  } else if (dir === 'overview') {
    v.dir.set(v.off.x, 0, v.off.z)
    if (v.dir.lengthSq() < 1e-12) v.dir.set(0, 0, 1)
    v.dir.normalize().addScaledVector(UP, OVERVIEW_ELEVATION).normalize()
  } else v.dir.copy(v.off).normalize()

  if (r.framing.snap) {
    camera.position.copy(v.dir).multiplyScalar(desired)
    r.framing = null
  } else {
    // Ease distance in log space: transitions span 6+ orders of magnitude at true scale.
    const nextLen = Math.exp(MathUtils.lerp(Math.log(len), Math.log(desired), k))
    v.off.normalize().lerp(v.dir, k).normalize()
    camera.position.copy(v.off).multiplyScalar(nextLen)
    if (Math.abs(nextLen - desired) < desired * cam.framingSettleRatio && v.off.angleTo(v.dir) < cam.framingSettleAngleRad) {
      r.framing = null
    }
  }
  camera.lookAt(0, 0, 0)
}

const solarDistance = (mode: ScaleMode) => scaleDistanceAu(scaleJump.solarFrameAu, mode, sceneConfig) / Math.sin(MathUtils.degToRad(cam.fovDeg) / 2)

function desiredDistance(
  positions: Map<string, readonly number[]>,
  focusId: string,
  radius: number,
  mode: ScaleMode,
  level: 'planetary' | 'solar' | 'galactic' | 'localGroup' | null,
): number {
  const body = getBody(focusId)
  if (level === 'solar') return solarDistance(mode)
  if (level === 'galactic') return scaleJump.galacticCameraDistancePc * sceneConfig.starfield.unitsPerParsec
  if (level === 'planetary') {
    // Frame the body and its moons.
    const p = positions.get(focusId)
    let farthest = 0
    for (const child of registry.bodies) {
      const c = positions.get(child.id)
      if (child.parentId !== focusId || !c || !p) continue
      farthest = Math.max(farthest, Math.hypot((c[0] ?? 0) - (p[0] ?? 0), (c[1] ?? 0) - (p[1] ?? 0), (c[2] ?? 0) - (p[2] ?? 0)))
    }
    return Math.max(radius * scaleJump.planetaryFrameInRadii, farthest * scaleJump.moonFrameMultiple)
  }
  // Frame the rings too, not just the globe.
  const extent = Math.max(1, (body.render.ring?.outerRadiusKm ?? 0) / body.telemetry.radiusKm)
  return radius * extent * cam.orbitDistanceInRadii
}
