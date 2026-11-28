import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { Group, Vector3 } from 'three'
import { getBody, registry, sceneConfig } from '../../config'
import { sampleOrbitAu } from '../../lib/ephemeris'
import type { Vec3 } from '../../lib/frames'
import { scaleVector } from '../../lib/scale'
import type { CelestialBody } from '../../schemas/celestial'
import { simDateNow, useSpaceStore } from '../../store/useSpaceStore'
import { useSim } from './simContext'

const { orbits } = sceneConfig
const MS_PER_DAY = 86_400_000

type Samples = { atMs: number; points: Vec3[] }

function OrbitLine({ body, parent }: { body: CelestialBody; parent: CelestialBody }) {
  const sim = useSim()
  const ref = useRef<Group>(null)
  const mode = useSpaceStore((s) => s.scaleMode)
  const selected = useSpaceStore((s) => s.selectedBodyId === body.id)
  const [samples, setSamples] = useState<Samples>(() => {
    const at = simDateNow()
    return { atMs: at.getTime(), points: sampleOrbitAu(body, parent, at, orbits.samples) }
  })
  const points = useMemo(() => {
    const pts = samples.points.map((p) => new Vector3(...scaleVector(p, mode, sceneConfig)))
    const first = pts[0]
    return first ? [...pts, first] : pts
  }, [samples, mode])
  const periodMs = (body.telemetry.orbitalPeriodDays ?? 0) * MS_PER_DAY

  useFrame(() => {
    // Orbits are relative to the parent, so moon orbits travel with their planet.
    const p = sim.positions.get(parent.id)
    if (p && ref.current) ref.current.position.set(p[0], p[1], p[2])
    // Orbits precess and moons' orbits wobble: resample once sim time has drifted far enough.
    if (Math.abs(sim.date.getTime() - samples.atMs) > periodMs * orbits.resampleFraction) {
      setSamples({ atMs: sim.date.getTime(), points: sampleOrbitAu(body, parent, sim.date, orbits.samples) })
    }
  })

  return (
    <group ref={ref}>
      <Line
        points={points}
        color={body.render.fallbackColor}
        lineWidth={orbits.lineWidthPx}
        transparent
        opacity={selected ? orbits.selectedOpacity : orbits.opacity}
        depthWrite={false}
        raycast={() => null}
      />
    </group>
  )
}

export function OrbitPaths() {
  const pairs = useMemo(
    () =>
      registry.bodies.flatMap((b) =>
        b.parentId !== null && b.telemetry.orbitalPeriodDays !== null ? [{ body: b, parent: getBody(b.parentId) }] : [],
      ),
    [],
  )
  // Orbit lines are a map overlay, not something you would see standing on a world.
  const firstPerson = useSpaceStore((s) => s.pov === 'vantage')
  if (firstPerson) return null
  return pairs.map((o) => <OrbitLine key={o.body.id} body={o.body} parent={o.parent} />)
}
