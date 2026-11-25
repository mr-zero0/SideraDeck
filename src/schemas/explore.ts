import { z } from 'zod'
import { SkySchema } from './scene'

const pos = z.number().positive()
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const Id = z.string().regex(/^[a-z][a-z0-9-]*$/)

export const StarVantagesSchema = z.object({
  version: z.literal(1),
  sources: z.record(z.string(), z.string()),
  stars: z
    .array(
      z.object({
        id: Id,
        hygName: z.string().min(1),
        name: z.string().min(1),
        radiusSolar: pos,
        vantageDistanceAu: pos,
        note: z.string(),
      }),
    )
    .min(1)
    // Never park the camera inside the star: 1 solar radius = 0.00465 AU.
    .refine((stars) => stars.every((s) => s.vantageDistanceAu > s.radiusSolar * 0.00465 * 2), 'vantageDistanceAu must be at least 2 stellar radii'),
})

export const SpacecraftConfigSchema = z.object({
  version: z.literal(1),
  source: z.string(),
  horizonsUrl: z.url(),
  dataUrl: z.string().startsWith('/'),
  craft: z
    .array(
      z.object({
        id: Id,
        name: z.string().min(1),
        horizonsId: z.string().regex(/^-?\d+$/),
        start: z.iso.date(),
        stop: z.iso.date(),
        step: z.string().min(1),
        launched: z.iso.date(),
        markerColor: HexColor,
        model: z
          .object({
            url: z.url(),
            path: z.string().regex(/^\/models\/[\w-]+\.glb$/),
            /** Largest real dimension in metres; the model is scaled so its bounding box matches. */
            sizeM: pos,
            /** What the craft keeps pointed at: its high-gain antenna (Earth) or sunshield (Sun). */
            pointsAt: z.enum(['earth', 'sun']),
            /** Model-space axis that points at `pointsAt`. */
            pointAxis: z.tuple([z.number(), z.number(), z.number()]).refine((v) => Math.hypot(...v) > 0, 'pointAxis cannot be zero'),
          })
          .optional(),
      }),
    )
    .min(1),
  modelSource: z.string(),
  modelLightIntensity: pos,
  modelAmbientIntensity: z.number().nonnegative(),
})

/** Trajectory file written by scripts/fetch-spacecraft.mjs. */
export const SpacecraftDataSchema = z.object({
  craft: z.array(
    z.object({
      id: z.string(),
      startMs: z.number(),
      stepMs: pos,
      xyz: z.array(z.number()).refine((a) => a.length >= 6 && a.length % 3 === 0, 'xyz must hold at least 2 samples'),
    }),
  ),
})
export type SpacecraftData = z.infer<typeof SpacecraftDataSchema>

export const GalaxiesSchema = z.object({
  version: z.literal(1),
  source: z.string(),
  unitsPerKpc: pos,
  cameraDistanceKpc: pos,
  milkyWay: z.object({ name: z.string(), diameterKpc: pos, sunToCenterKpc: pos, color: HexColor }),
  galaxies: z.array(
    z.object({
      id: Id,
      name: z.string().min(1),
      raDeg: z.number().min(0).max(360),
      decDeg: z.number().min(-90).max(90),
      distanceKpc: pos,
      diameterKpc: pos,
      positionAngleDeg: z.number().min(0).max(360),
      inclinationDeg: z.number().min(0).max(90),
      type: z.enum(['spiral', 'irregular', 'elliptical']),
      color: HexColor,
    }),
  ),
})

export const MomentsSchema = z.object({
  version: z.literal(1),
  moments: z.array(z.object({ id: Id, title: z.string().min(1), blurb: z.string().min(1), view: z.string().min(1) })).min(1),
})
export type Moment = z.infer<typeof MomentsSchema>['moments'][number]

export type StarVantage =z.infer<typeof StarVantagesSchema>['stars'][number]
export type Spacecraft = z.infer<typeof SpacecraftConfigSchema>['craft'][number]
export type Galaxy = z.infer<typeof GalaxiesSchema>['galaxies'][number]

/** Dated Earth events used to say which year a star's light (or Earth's, seen from a star) left. */
export const LightEchoesSchema = z.object({
  version: z.literal(1),
  note: z.string(),
  matchWindow: z.object({ minYears: pos, fractionOfLightTime: pos }),
  beforeHistory: z.string().min(1),
  events: z
    .array(z.object({ year: z.number().int(), approximate: z.boolean(), text: z.string().min(1), source: z.url() }))
    .min(1)
    .refine((ev) => ev.every((e, i) => i === 0 || (ev[i - 1]?.year ?? -Infinity) < e.year), 'events must be sorted by year, no duplicates'),
})
export type LightEchoes = z.infer<typeof LightEchoesSchema>

/** Landable exoplanets. Measured values from the NASA Exoplanet Archive; `illustrative` is art, labelled as such in the UI. */
export const ExoplanetsSchema = z.object({
  version: z.literal(1),
  source: z.string(),
  queryUrl: z.url(),
  note: z.string(),
  view: z.object({
    hostElevationDeg: z.number().min(-10).max(90),
    solElevationDeg: z.number().min(0).max(90),
    solAzimuthFromHostDeg: z.number().min(0).max(180),
  }),
  planets: z
    .array(
      z.object({
        id: Id,
        name: z.string().min(1),
        archiveName: z.string().min(1),
        host: z.object({
          name: z.string().min(1),
          /** When the host is in the HYG catalog, stand at its catalog position so it is not drawn twice. */
          hygName: z.string().min(1).optional(),
          raDeg: z.number().min(0).lt(360),
          decDeg: z.number().min(-90).max(90),
          distancePc: pos,
          teffK: pos,
          radiusSolar: pos,
        }),
        planet: z.object({
          semiMajorAu: pos,
          periodDays: pos,
          radiusEarth: pos,
          radiusMeasured: z.boolean(),
          massEarth: pos,
          massIsMinimum: z.boolean(),
          eqTempK: pos,
          insolationEarth: pos,
          discoveryYear: z.number().int(),
          discoveryMethod: z.string().min(1),
        }),
        reference: z.object({ label: z.string().min(1), url: z.url() }),
        illustrative: z.object({ groundColor: HexColor, hazeColor: HexColor, visibleLight: z.number().positive().max(1), sky: SkySchema, note: z.string().min(1) }),
      }),
    )
    .min(1),
})
export type Exoplanet = z.infer<typeof ExoplanetsSchema>['planets'][number]
