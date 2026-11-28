import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils, PerspectiveCamera, Ray, Sphere, Vector3, type Camera } from 'three'
import { registry, rootBody, sceneConfig, spacecraftConfig } from '../../config'
import { GALACTIC_CENTER_EQJ, eqjToScene } from '../../lib/frames'
import { scaleRadiusKm } from '../../lib/scale'
import { craftKey, useSpaceStore } from '../../store/useSpaceStore'
import { LOCAL_GROUP } from './LocalGroup'
import { useStarNames } from '../../store/useStarNames'
import { GALACTIC_CENTER_LABEL_ID, galaxyKey, starKey, useSim } from './simContext'

const { markers, starfield } = sceneConfig
const GC_POSITION = new Vector3(...eqjToScene(GALACTIC_CENTER_EQJ)).multiplyScalar(starfield.galacticCenterLabelPc * starfield.unitsPerParsec)
const GALACTIC_VISIBLE_MIX = 0.5
const LABEL_GAP_PX = 6
const LABEL_LINE_PX = 13
const LABEL_MAX_STACK = 4
const LABEL_FALLBACK_WIDTH_PX = 70
// Star names fade out with the stars once twilight brightens past this.
const STAR_LABEL_MAX_DAYLIGHT = 0.5
// Labels for directions "at infinity" (the Sun seen from another star) are placed this far out.
const SKY_LABEL_DISTANCE = 1e5

/**
 * Projects bodies, spacecraft and galaxies to screen space once per frame and moves their DOM labels
 * (rendered outside the canvas by <BodyLabelLayer>). Which labels show depends on the view.
 */
export function BodyLabelProjector() {
  const sim = useSim()
  const size = useThree((s) => s.size)
  const v = useMemo(() => ({ p: new Vector3(), ndc: new Vector3(), ray: new Ray(), hit: new Vector3(), focus: new Sphere() }), [])

  // Label boxes placed this frame, so close neighbours (Earth and Moon seen from Mars) stack, not overprint.
  const placed: { x: number; y: number; w: number }[] = []
  // offsetPx moves the label beside a visible disc instead of on top of it.
  const place = (el: HTMLElement | undefined, hidden: boolean, offsetPx = 0) => {
    if (!el) return
    el.style.visibility = hidden ? 'hidden' : 'visible'
    if (!hidden) {
      const x = ((v.ndc.x + 1) / 2) * size.width + offsetPx
      let y = ((1 - v.ndc.y) / 2) * size.height
      const w = el.offsetWidth || LABEL_FALLBACK_WIDTH_PX
      for (let tries = 0; tries < LABEL_MAX_STACK; tries++) {
        const hit = placed.some((p) => Math.abs(p.y - y) < LABEL_LINE_PX && x < p.x + p.w && p.x < x + w)
        if (!hit) break
        y += LABEL_LINE_PX
      }
      placed.push({ x, y, w })
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    }
  }
  const project = (camera: Camera) => {
    v.ndc.copy(v.p).project(camera)
    return v.ndc.z > 1 || Math.abs(v.ndc.x) > 1.05 || Math.abs(v.ndc.y) > 1.05
  }
  const occluded = (camera: Camera, dist: number) => {
    v.ray.set(camera.position, v.hit.copy(v.p).sub(camera.position).normalize())
    const blocker = v.ray.intersectSphere(v.focus, v.hit)
    return blocker !== null && camera.position.distanceTo(blocker) < dist
  }

  useFrame(({ camera }) => {
    placed.length = 0
    if (!(camera instanceof PerspectiveCamera) || !sim.world.current) return
    const { selectedBodyId, scaleMode, pov, scaleJumpLevel, lookTargetId, showLabels } = useSpaceStore.getState()
    const galactic = sim.galacticMix > GALACTIC_VISIBLE_MIX
    const localGroup = pov === 'scaleJump' && scaleJumpLevel === 'localGroup'
    const firstPerson = pov === 'vantage'
    const pxPerUnitAtDist1 = size.height / 2 / Math.tan(MathUtils.degToRad(camera.fov) / 2)
    const offset = sim.world.current.position
    // The focus body is the only occluder tested (at eye level it is the ground under you).
    const focusBody = registry.bodies.find((b) => b.id === sim.focusId)
    const fp = sim.positions.get(sim.focusId)
    v.focus.center.set(fp?.[0] ?? 0, fp?.[1] ?? 0, fp?.[2] ?? 0).add(offset)
    v.focus.radius = focusBody ? scaleRadiusKm(focusBody.telemetry.radiusKm, scaleMode, sceneConfig) : 0

    for (const b of registry.bodies) {
      const el = sim.labels.get(b.id)
      const p = sim.positions.get(b.id)
      if (!el || !p) continue
      if (sim.starView) {
        // At another star only the Sun is labelled, as a point on the sky.
        v.p.copy(camera.position).addScaledVector(sim.starView.sunDir, SKY_LABEL_DISTANCE)
        place(el, b.id !== rootBody.id || !(showLabels || lookTargetId === rootBody.id) || project(camera))
        continue
      }
      v.p.set(p[0], p[1], p[2]).add(offset)
      const dist = camera.position.distanceTo(v.p)
      const radiusPx = (scaleRadiusKm(b.telemetry.radiusKm, scaleMode, sceneConfig) / dist) * pxPerUnitAtDist1
      let hidden: boolean
      let shift = 0
      if (localGroup || !sim.world.current.visible) hidden = !(galactic && b.id === rootBody.id)
      else if (firstPerson) {
        // First person: name every other world in the sky (or just the target with labels off).
        // The Sun's label hides while something covers it completely (total eclipse).
        hidden = b.id === sim.focusId || (!showLabels && b.id !== lookTargetId) || (b.id === rootBody.id && sim.sunlight === 0)
        if (radiusPx > markers.hideAboveRadiusPx) shift = radiusPx + LABEL_GAP_PX
      } else hidden = galactic ? b.id !== rootBody.id : (b.id === selectedBodyId && pov !== 'scaleJump') || radiusPx > markers.hideAboveRadiusPx
      hidden ||= project(camera)
      if (!hidden && !galactic) hidden = occluded(camera, dist)
      place(el, hidden, shift)
    }

    for (const c of spacecraftConfig.craft) {
      const key = craftKey(c.id)
      const p = sim.positions.get(key)
      const el = sim.labels.get(key)
      if (!el) continue
      if (!p || sim.starView || localGroup || galactic || !sim.world.current.visible || key === sim.focusId || (firstPerson && key !== lookTargetId)) {
        place(el, true)
        continue
      }
      v.p.set(p[0], p[1], p[2]).add(offset)
      const dist = camera.position.distanceTo(v.p)
      place(el, project(camera) || occluded(camera, dist))
    }

    // Bright named stars, with brightness recomputed from wherever you stand. Hidden in daylight glare.
    const stars = sim.stars
    const starsOn = firstPerson && showLabels && sim.daylight < STAR_LABEL_MAX_DAYLIGHT && stars !== null
    for (const [name] of useStarNames.getState().names) {
      const el = sim.labels.get(starKey(name))
      const i = stars?.names[name]
      if (!el) continue
      if (!starsOn || !stars || i === undefined) {
        place(el, true)
        continue
      }
      const px = (stars.positions3d[i * 3] ?? 0) - stars.vantage.x
      const py = (stars.positions3d[i * 3 + 1] ?? 0) - stars.vantage.y
      const pz = (stars.positions3d[i * 3 + 2] ?? 0) - stars.vantage.z
      const dPc = Math.hypot(px, py, pz) / sceneConfig.starfield.unitsPerParsec
      const mag = (stars.absMags[i] ?? 99) + 5 * Math.log10(Math.max(dPc, 1e-6) / 10)
      if (dPc < 1e-3 || mag > sceneConfig.quality.starLabelMagnitude) {
        place(el, true)
        continue
      }
      v.p.set(px, py, pz).normalize().multiplyScalar(SKY_LABEL_DISTANCE).add(camera.position)
      place(el, project(camera) || occluded(camera, SKY_LABEL_DISTANCE), LABEL_GAP_PX)
    }

    for (const g of LOCAL_GROUP) {
      v.p.copy(g.frame.position).sub(sim.localGroupFocus)
      place(sim.labels.get(galaxyKey(g.id)), !localGroup || project(camera))
    }

    v.p.copy(GC_POSITION)
    place(sim.labels.get(GALACTIC_CENTER_LABEL_ID), !galactic || localGroup || project(camera))
  })
  return null
}

const labelClass = 'flex -translate-x-[3px] -translate-y-1/2 items-center gap-1.5 whitespace-nowrap font-mono text-micro uppercase text-ink-muted'

function Label({ id, name, color, labels, onClick, square = false, star = false }: { id: string; name: string; color: string; labels: Map<string, HTMLElement>; onClick: () => void; square?: boolean; star?: boolean }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      ref={(el) => {
        if (el) labels.set(id, el)
        else labels.delete(id)
      }}
      onClick={onClick}
      data-star={star ? 'true' : undefined}
      style={{ visibility: 'hidden' }}
      className="pointer-events-auto absolute top-0 left-0 cursor-pointer will-change-transform"
    >
      {/* Star names: lighter, no marker dot, so they never compete with planet labels. */}
      <span className={star ? `${labelClass} pointer-events-none normal-case text-ink-faint` : `${labelClass} hover:text-ink`}>
        {!star && <span className={`block shrink-0 ${square ? '' : 'rounded-full'}`} style={{ width: markers.sizePx, height: markers.sizePx, background: color }} />}
        {name}
      </span>
    </button>
  )
}

/** DOM side of the labels: plain buttons in one absolutely positioned layer above the canvas. */
export function BodyLabelLayer({ labels }: { labels: Map<string, HTMLElement> }) {
  const select = useSpaceStore((s) => s.select)
  const inspectCraft = useSpaceStore((s) => s.inspectCraft)
  const setGalaxyFocus = useSpaceStore((s) => s.setGalaxyFocus)
  const starNames = useStarNames((s) => s.names)
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {registry.bodies.map((b) => (
        <Label key={b.id} id={b.id} name={b.name} color={b.render.fallbackColor} labels={labels} onClick={() => select(b.id)} />
      ))}
      {spacecraftConfig.craft.map((c) => (
        <Label key={c.id} id={craftKey(c.id)} name={c.name} color={c.markerColor} labels={labels} square onClick={() => inspectCraft(c.id)} />
      ))}
      {starNames.map(([name]) => (
        <Label key={name} id={starKey(name)} name={name} color="" labels={labels} star onClick={() => undefined} />
      ))}
      {LOCAL_GROUP.map((g) => (
        <Label key={g.id} id={galaxyKey(g.id)} name={g.name} color={g.color} labels={labels} onClick={() => setGalaxyFocus(g.id)} />
      ))}
      <div
        ref={(el) => {
          if (el) labels.set(GALACTIC_CENTER_LABEL_ID, el)
          else labels.delete(GALACTIC_CENTER_LABEL_ID)
        }}
        style={{ visibility: 'hidden' }}
        className="absolute top-0 left-0 will-change-transform"
      >
        <span className={labelClass}>Toward galactic centre · {starfield.galacticCenterDistanceKpc} kpc</span>
      </div>
    </div>
  )
}
