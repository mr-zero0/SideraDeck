import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { Box3, DirectionalLight, Group, Vector3 } from 'three'
import { getCraft, rootBody, sceneConfig, spacecraftConfig } from '../../config'
import { craftRadiusUnits } from '../../lib/spacecraft'
import type { Spacecraft } from '../../schemas/explore'
import { craftKey, useSpaceStore } from '../../store/useSpaceStore'
import { ErrorBoundary } from '../ErrorBoundary'
import { useSim } from './simContext'

type Model = NonNullable<Spacecraft['model']>

function ModelMesh({ craft, model }: { craft: Spacecraft; model: Model }) {
  const sim = useSim()
  const mode = useSpaceStore((s) => s.scaleMode)
  const { scene } = useGLTF(model.path)
  // Both Voyagers share one file; each mount needs its own scene graph.
  const object = useMemo(() => scene.clone(true), [scene])
  const fit = useMemo(() => {
    const box = new Box3().setFromObject(object)
    const size = box.getSize(new Vector3())
    return { center: box.getCenter(new Vector3()), extent: Math.max(size.x, size.y, size.z) }
  }, [object])
  const outer = useRef<Group>(null)
  const attitude = useRef<Group>(null)
  const light = useRef<DirectionalLight>(null)
  const axis = useMemo(() => new Vector3(...model.pointAxis).normalize(), [model.pointAxis])
  const v = useMemo(() => ({ dir: new Vector3(), sun: new Vector3() }), [])
  const scale = (craftRadiusUnits(craft.id, mode) * 2) / fit.extent

  useEffect(() => {
    if (light.current && outer.current) light.current.target = outer.current
  }, [])

  useFrame(() => {
    const p = sim.positions.get(craftKey(craft.id))
    const s = sim.positions.get(rootBody.id)
    const t = sim.positions.get(model.pointsAt === 'sun' ? rootBody.id : sceneConfig.vantage.earthId)
    if (!p || !s || !t || !outer.current || !attitude.current || !light.current) return
    outer.current.position.set(p[0], p[1], p[2])
    // Real attitude: the antenna tracks Earth, or the shield faces the Sun.
    v.dir.set(t[0] - p[0], t[1] - p[1], t[2] - p[2]).normalize()
    attitude.current.quaternion.setFromUnitVectors(axis, v.dir)
    v.sun.set(s[0] - p[0], s[1] - p[1], s[2] - p[2]).normalize()
    light.current.position.copy(v.sun)
  })

  return (
    <group ref={outer}>
      <directionalLight ref={light} intensity={spacecraftConfig.modelLightIntensity} />
      <group ref={attitude} scale={scale}>
        <primitive object={object} position={fit.center.clone().negate()} />
      </group>
    </group>
  )
}

/** NASA 3D model of the inspected spacecraft, at real size and attitude. Lit only by the Sun. */
export function CraftModel() {
  const id = useSpaceStore((s) => (s.pov === 'orbital' ? s.craftFocusId : null))
  const craft = id ? getCraft(id) : undefined
  if (!craft?.model) return null
  return (
    <ErrorBoundary label={`model:${craft.id}`} fallback={null}>
      <Suspense fallback={null}>
        <ambientLight intensity={spacecraftConfig.modelAmbientIntensity} />
        <ModelMesh craft={craft} model={craft.model} />
      </Suspense>
    </ErrorBoundary>
  )
}
