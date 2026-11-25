import { z } from 'zod'
import { Body } from 'astronomy-engine'

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #rrggbb')
const AssetPath = z.string().regex(/^\/[\w./-]+$/, 'expected an absolute public path')

const AtmosphereSchema = z.object({
  color: HexColor,
  intensity: z.number().nonnegative(),
  power: z.number().positive(),
  scale: z.number().gt(1),
  /** Colour and strength of sunlight scattered through the limb when the body is backlit. */
  forwardColor: HexColor.optional(),
  forwardIntensity: z.number().nonnegative().optional(),
})

const CloudsSchema = z.object({
  map: AssetPath,
  altitudeKm: z.number().positive(),
  driftDegPerHour: z.number(),
})

const RingSchema = z
  .object({
    innerRadiusKm: z.number().positive(),
    outerRadiusKm: z.number().positive(),
    map: AssetPath,
  })
  .refine((r) => r.outerRadiusKm > r.innerRadiusKm, 'outerRadiusKm must exceed innerRadiusKm')

const TelemetrySchema = z.object({
  radiusKm: z.number().positive(),
  massKg: z.number().positive(),
  surfaceGravityMs2: z.number().positive(),
  escapeVelocityKms: z.number().positive(),
  // Negative = retrograde rotation, as in the NASA fact sheet.
  siderealRotationHours: z.number().refine((v) => v !== 0, 'rotation period cannot be 0'),
  orbitalPeriodDays: z.number().positive().nullable(),
  meanTemperatureC: z.number(),
  /** NASA fact-sheet geometric albedo; null for stars. Drives apparent-magnitude estimates. */
  geometricAlbedo: z.number().gt(0).max(1).nullable(),
  axialTiltDeg: z.number().min(0).max(180),
  sourceKeys: z.array(z.string()).min(1),
})

const RenderSchema = z.object({
  emissive: z.boolean(),
  albedoMap: AssetPath,
  nightMap: AssetPath.optional(),
  clouds: CloudsSchema.optional(),
  fallbackColor: HexColor,
  atmosphere: AtmosphereSchema.optional(),
  ring: RingSchema.optional(),
  /** 8K/4K maps loaded only while the body fills a large part of the screen. */
  hiRes: z
    .object({ albedoMap: AssetPath, nightMap: AssetPath.optional(), cloudsMap: AssetPath.optional(), ringMap: AssetPath.optional() })
    .optional(),
})

export const BodyKindSchema = z.enum(['star', 'planet', 'moon', 'dwarf'])

export const CelestialBodySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1),
  kind: BodyKindSchema,
  parentId: z.string().nullable(),
  ephemerisBody: z.enum(Body),
  telemetry: TelemetrySchema,
  render: RenderSchema,
  missions: z.array(z.string()),
})

export const CelestialRegistrySchema = z
  .object({
    version: z.literal(1),
    sources: z.record(z.string(), z.string()),
    bodies: z.array(CelestialBodySchema).min(1),
  })
  .superRefine((reg, ctx) => {
    const ids = new Set<string>()
    for (const [i, b] of reg.bodies.entries()) {
      if (ids.has(b.id)) ctx.addIssue({ code: 'custom', path: ['bodies', i, 'id'], message: `duplicate id "${b.id}"` })
      ids.add(b.id)
    }
    const roots = reg.bodies.filter((b) => b.parentId === null)
    if (roots.length !== 1) ctx.addIssue({ code: 'custom', path: ['bodies'], message: `expected 1 root body, found ${roots.length}` })
    for (const [i, b] of reg.bodies.entries()) {
      if (b.parentId !== null && !ids.has(b.parentId)) {
        ctx.addIssue({ code: 'custom', path: ['bodies', i, 'parentId'], message: `unknown parent "${b.parentId}"` })
      }
      for (const key of b.telemetry.sourceKeys) {
        if (!(key in reg.sources)) {
          ctx.addIssue({ code: 'custom', path: ['bodies', i, 'telemetry', 'sourceKeys'], message: `undeclared source "${key}"` })
        }
      }
    }
  })

export type CelestialBody = z.infer<typeof CelestialBodySchema>
export type CelestialRegistry = z.infer<typeof CelestialRegistrySchema>
