import { describe, expect, it } from 'vitest'
import registryJson from '../../config/celestial-registry.json'
import sceneJson from '../../config/scene-config.json'
import aiJson from '../../config/ai-config.json'
import { CelestialRegistrySchema } from './celestial'
import { SceneConfigSchema } from './scene'
import { AiConfigSchema } from './ai'

const clone = <T>(v: T): T => structuredClone(v)

describe('celestial registry schema', () => {
  it('accepts the shipped registry', () => {
    const parsed = CelestialRegistrySchema.parse(registryJson)
    expect(parsed.bodies.map((b) => b.id)).toContain('earth')
  })

  it('rejects duplicate body ids', () => {
    const bad = clone(registryJson)
    const first = bad.bodies[0]
    if (!first) throw new Error('fixture empty')
    bad.bodies.push(clone(first))
    expect(CelestialRegistrySchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a parentId that is not in the registry', () => {
    const bad = clone(registryJson)
    const moon = bad.bodies.find((b) => b.id === 'moon')
    if (!moon) throw new Error('fixture missing moon')
    moon.parentId = 'pluto'
    expect(CelestialRegistrySchema.safeParse(bad).success).toBe(false)
  })

  it('rejects an ephemeris body astronomy-engine does not know', () => {
    const bad = clone(registryJson)
    const earth = bad.bodies.find((b) => b.id === 'earth')
    if (!earth) throw new Error('fixture missing earth')
    earth.ephemerisBody = 'Vulcan'
    expect(CelestialRegistrySchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a source key that is not declared', () => {
    const bad = clone(registryJson)
    const earth = bad.bodies.find((b) => b.id === 'earth')
    if (!earth) throw new Error('fixture missing earth')
    earth.telemetry.sourceKeys = ['wikipedia']
    expect(CelestialRegistrySchema.safeParse(bad).success).toBe(false)
  })

  it('requires exactly one root body', () => {
    const bad = clone(registryJson)
    const earth = bad.bodies.find((b) => b.id === 'earth')
    if (!earth) throw new Error('fixture missing earth')
    earth.parentId = null
    expect(CelestialRegistrySchema.safeParse(bad).success).toBe(false)
  })
})

describe('scene config schema', () => {
  it('accepts the shipped scene config', () => {
    expect(SceneConfigSchema.safeParse(sceneJson).success).toBe(true)
  })

  it('rejects a non-positive orbit sample count', () => {
    const bad = clone(sceneJson)
    bad.orbits.samples = 0
    expect(SceneConfigSchema.safeParse(bad).success).toBe(false)
  })
})

describe('ai config schema', () => {
  it('accepts the shipped ai config', () => {
    expect(AiConfigSchema.safeParse(aiJson).success).toBe(true)
  })

  it('rejects a default tier that does not exist', () => {
    const bad = clone(aiJson)
    bad.defaultTierId = 'wizard'
    expect(AiConfigSchema.safeParse(bad).success).toBe(false)
  })
})
