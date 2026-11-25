import { z } from 'zod'
import registryJson from '../../config/celestial-registry.json'
import sceneJson from '../../config/scene-config.json'
import aiJson from '../../config/ai-config.json'
import { CelestialRegistrySchema, type CelestialBody } from '../schemas/celestial'
import { SceneConfigSchema } from '../schemas/scene'
import { AiConfigSchema } from '../schemas/ai'
import starVantagesJson from '../../config/star-vantages.json'
import spacecraftJson from '../../config/spacecraft.json'
import galaxiesJson from '../../config/galaxies.json'
import momentsJson from '../../config/moments.json'
import lightEchoesJson from '../../config/light-echoes.json'
import exoplanetsJson from '../../config/exoplanets.json'
import { ExoplanetsSchema, GalaxiesSchema, LightEchoesSchema, MomentsSchema, SpacecraftConfigSchema, StarVantagesSchema } from '../schemas/explore'

function parseConfig<T extends z.ZodType>(name: string, schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data)
  if (!result.success) throw new Error(`Invalid ${name}:\n${z.prettifyError(result.error)}`)
  return result.data
}

export const registry = parseConfig('config/celestial-registry.json', CelestialRegistrySchema, registryJson)
export const sceneConfig = parseConfig('config/scene-config.json', SceneConfigSchema, sceneJson)
export const aiConfig = parseConfig('config/ai-config.json', AiConfigSchema, aiJson)

const bodyMap = new Map(registry.bodies.map((b) => [b.id, b]))

export function getBody(id: string): CelestialBody {
  const b = bodyMap.get(id)
  if (!b) throw new Error(`Unknown body id "${id}"`)
  return b
}

const root = registry.bodies.find((b) => b.parentId === null)
if (!root) throw new Error('Registry has no root body')
/** The body every other body ultimately orbits (the Sun); also the light source. */
export const rootBody: CelestialBody = root

export const starVantages = parseConfig('config/star-vantages.json', StarVantagesSchema, starVantagesJson)
export const spacecraftConfig = parseConfig('config/spacecraft.json', SpacecraftConfigSchema, spacecraftJson)
export const galaxiesConfig = parseConfig('config/galaxies.json', GalaxiesSchema, galaxiesJson)
export const momentsConfig = parseConfig('config/moments.json', MomentsSchema, momentsJson)
export const exoplanetsConfig = parseConfig('config/exoplanets.json', ExoplanetsSchema, exoplanetsJson)
export const lightEchoesConfig = parseConfig('config/light-echoes.json', LightEchoesSchema, lightEchoesJson)

export const getStarVantage = (id: string) => starVantages.stars.find((s) => s.id === id)
export const getExoplanet = (id: string) => exoplanetsConfig.planets.find((p) => p.id === id)
export const getCraft = (id: string) => spacecraftConfig.craft.find((c) => c.id === id)

// Cross-file reference checks: fail at startup, not at first click.
getBody(sceneConfig.camera.initialBodyId)
getBody(sceneConfig.vantage.earthId)
getBody(sceneConfig.vantage.earthVantageTargetId)
