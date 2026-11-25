import { z } from 'zod'

const pos = z.number().positive()
const Rgb = z.tuple([z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative()])
const PowerLaw = z.object({ unitsPerAuPow: pos, exponent: pos.max(1) })

/** Single-scattering atmosphere seen from the ground (coefficients per km at the surface). */
export const SkySchema = z.object({
  thicknessKm: pos,
  rayleigh: Rgb,
  rayleighHeightKm: pos,
  mie: Rgb,
  mieHeightKm: pos,
  mieG: z.number().min(0).lt(1),
  sunIntensity: pos,
  forwardTint: Rgb.optional(),
  /** Distance at which the ground fades halfway into the sky colour. */
  hazeKm: pos,
})
export type Sky = z.infer<typeof SkySchema>

export const SceneConfigSchema = z.object({
  time: z
    .object({
      defaultRate: z.number(),
      minDate: z.iso.datetime(),
      maxDate: z.iso.datetime(),
      ratePresets: z.array(z.object({ label: z.string().min(1), rate: z.number() })).min(1),
    })
    .refine((t) => Date.parse(t.minDate) < Date.parse(t.maxDate), 'minDate must precede maxDate'),
  optics: z
    .object({
      eyeFovDeg: pos.max(120),
      minFovDeg: pos,
      maxFovDeg: pos.max(120),
      eyeLimitingMagnitude: z.number(),
      wheelZoomPerDeltaY: pos,
      presets: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), fovDeg: pos })).min(1),
      eyepieceBelowFovDeg: pos,
    })
    .refine((o) => o.minFovDeg < o.maxFovDeg, 'minFovDeg must be below maxFovDeg'),
  vantage: z.object({
    eyeHeightM: pos,
    walkSpeedMs: pos,
    runMultiplier: pos,
    earthriseElevationDeg: z.number().min(1).max(89),
    earthshineIntensity: z.number().nonnegative(),
    airlessGlareStarFade: z.number().min(0).max(1),
    sunGlareDeg: pos,
    noTerrainBodyIds: z.array(z.string()),
    terrain: z.object({
      radiusM: pos,
      rings: z.number().int().min(8),
      segments: z.number().int().min(8),
      innerRadiusM: pos,
      octaves: z.array(z.object({ wavelengthM: pos, amplitudeM: z.number().nonnegative() })).min(1),
    }),
    skyDomeScale: z.number().gt(1),
    targetElevationDeg: z.number().min(1).max(89),
    twilightSunDepthDeg: z.number().min(0).max(18),
    trackLambda: pos,
    maxPitchDeg: pos.max(90),
    craftMarkerRadiusKm: pos,
    earthId: z.string(),
    earthVantageTargetId: z.string(),
  }),
  pov: z.object({
    scaleJump: z.object({
      planetaryFrameInRadii: pos,
      moonFrameMultiple: pos,
      solarFrameAu: pos,
      galacticCameraDistancePc: pos,
    }),
  }),
  quality: z
    .object({
      hiResOnPx: pos,
      hiResOffPx: pos,
      hiResSphereSegments: z.number().int().min(16),
      starLabelMagnitude: z.number(),
      maxDpr: pos,
      phoneMaxDpr: pos,
      skySteps: z.object({ view: z.number().int().min(2), light: z.number().int().min(2) }),
      phoneSkySteps: z.object({ view: z.number().int().min(2), light: z.number().int().min(2) }),
    })
    .refine((q) => q.hiResOffPx < q.hiResOnPx, 'hiResOffPx must be below hiResOnPx (hysteresis)'),
  hud: z.object({ liveRefreshMs: z.number().int().min(16) }),
  events: z.object({
    eclipsesEach: z.number().int().min(1),
    lunarEclipseLonDeg: z.number().min(-180).max(180),
    eclipseFovDeg: pos,
    transitSunElevationDeg: z.number().min(1).max(89),
    transitFovDeg: pos,
    oppositionFovDeg: pos,
    /** Target within this angle of the Sun: both stand high together (eclipses, transits). */
    sunTogetherDeg: pos,
  }),
  skies: z.object({
    note: z.string(),
    bodies: z.record(
      z.string(),
      SkySchema,
    ),
  }),
  scaleModes: z.object({
    navigable: z.object({
      distance: PowerLaw,
      radius: z.object({ unitsPerKmPow: pos, exponent: pos.max(1) }),
    }),
    true: z.object({ unitsPerKm: pos }),
  }),
  lighting: z.object({
    ambient: z.number().min(0).max(1),
    sunIntensity: pos,
    terminatorSoftness: pos.max(1),
    nightLightsIntensity: z.number().nonnegative(),
    cloudMinShellScale: z.number().gt(1),
  }),
  geometry: z.object({ sphereSegments: z.number().int().min(16), ringSegments: z.number().int().min(16) }),
  camera: z.object({
    fovDeg: pos.max(120),
    near: pos,
    nearFractionOfDistance: pos.max(0.1),
    far: pos,
    orbitDistanceInRadii: z.number().gt(1),
    minDistanceInRadii: z.number().gt(1),
    transitionLambda: pos,
    transitionSettleRatio: pos.max(1),
    framingSettleRatio: pos.max(1),
    framingSettleAngleRad: pos,
    controls: z.object({ dampingFactor: pos.max(1), rotateSpeed: pos, zoomSpeed: pos }),
    litViewAngleDeg: z.number().min(0).max(180),
    litViewElevation: z.number(),
    initialBodyId: z.string(),
  }),
  orbits: z.object({
    samples: z.number().int().min(16),
    opacity: z.number().min(0).max(1),
    selectedOpacity: z.number().min(0).max(1),
    lineWidthPx: pos,
    resampleFraction: pos.max(1),
  }),
  markers: z.object({ sizePx: pos, hideAboveRadiusPx: pos }),
  starfield: z.object({
    dataUrl: z.string().startsWith('/'),
    catalogFaintestMagnitude: z.number(),
    /** Stars at least this bright (from Earth) keep their proper names for labels. */
    namedStarMagnitude: z.number(),
    milkyWayColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    milkyWayIntensity: z.number().min(0).max(1),
    vantageStarGlowScale: z.number().gt(1),
    vantageStarGlowOpacity: z.number().min(0).max(1),
    sphereRadius: pos,
    unitsPerParsec: pos,
    galacticCenterLabelPc: pos,
    galacticCenterDistanceKpc: pos,
    brightestMagnitude: z.number(),
    faintestMagnitude: z.number(),
    maxPointSizePx: pos,
    minPointSizePx: pos,
    minAlpha: z.number().min(0).max(1),
  }),
})

export type SceneConfig = z.infer<typeof SceneConfigSchema>
export type ScaleMode = keyof SceneConfig['scaleModes']
export type Pov = 'orbital' | 'vantage' | 'scaleJump'
export type ScaleJumpLevel = 'planetary' | 'solar' | 'galactic' | 'localGroup'
