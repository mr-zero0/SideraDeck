import { z } from 'zod'
import { KM_PER_AU } from 'astronomy-engine'
import { getBody, getCraft, getExoplanet, getStarVantage, registry } from '../config'
import { hostEquatorialPc } from '../lib/exoplanet'
import { eqjToEcl, type Vec3 } from '../lib/frames'
import { LY_PER_PC, lightEcho } from '../lib/lightEcho'
import { helioEclAu } from '../lib/observer'
import { observe } from '../lib/photometry'
import type { CraftTrack } from '../lib/spacecraft'
import { bvToTemperatureK } from '../lib/starfield'

/** "What am I looking at?": only ids and a date travel; every number is recomputed where it is used. */
export const IdentifySchema = z.object({
  observer: z.object({ kind: z.enum(['body', 'star', 'craft', 'exoplanet']), id: z.string().min(1).max(64) }),
  target: z.object({ kind: z.enum(['body', 'star', 'craft']), id: z.string().min(1).max(64) }),
  dateIso: z.iso.datetime(),
})
export type IdentifyRequest = z.infer<typeof IdentifySchema>

/** Catalog star by HYG proper name: J2000 equatorial parsecs, absolute magnitude, B-V. */
export type StarLookup = (name: string) => { pc: Vec3; absMag: number; ci: number } | null

export type IdentifyDeps = { tracks: readonly CraftTrack[] | null; star: StarLookup }

export type IdentifyFacts = { subject: string; observer: string; facts: Record<string, number | string> }

// Physical constants.
const AU_PER_PC = 206_264.806
const C_KM_S = 299_792.458
const SECONDS_PER_YEAR = 31_557_600

const round = (v: number, digits: number) => Number(v.toFixed(digits))
const sig = (v: number, n: number) => Number(v.toPrecision(n))
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

function starAu(star: StarLookup, name: string): Vec3 | null {
  const s = star(name)
  if (!s) return null
  const [x, y, z] = eqjToEcl(s.pc)
  return [x * AU_PER_PC, y * AU_PER_PC, z * AU_PER_PC]
}

function positionAu(p: IdentifyRequest['observer'], role: 'observer' | 'target', date: Date, deps: IdentifyDeps): Vec3 | null {
  if (p.kind === 'craft') return getCraft(p.id) ? helioEclAu(`craft:${p.id}`, date, deps.tracks) : null
  if (p.kind === 'body') return registry.bodies.some((b) => b.id === p.id) ? helioEclAu(p.id, date, deps.tracks) : null
  if (p.kind === 'exoplanet') {
    // A planet a few hundredths of an AU from its star: the star's position is the observer's.
    const ex = getExoplanet(p.id)
    if (!ex) return null
    // Same rule as the renderer: the catalog position wins when the host is in HYG.
    const catalog = ex.host.hygName ? starAu(deps.star, ex.host.hygName) : null
    if (catalog) return catalog
    const [x, y, z] = eqjToEcl(hostEquatorialPc(ex.host))
    return [x * AU_PER_PC, y * AU_PER_PC, z * AU_PER_PC]
  }
  // Observers stand near a configured vantage star; targets are any named catalog star.
  const name = role === 'observer' ? getStarVantage(p.id)?.hygName : p.id
  return name ? starAu(deps.star, name) : null
}

const historianYear = (key: string, astronomical: number): Record<string, number> =>
  astronomical > 0 ? { [`${key}_ce`]: astronomical } : { [`${key}_bce`]: 1 - astronomical }

function label(p: IdentifyRequest['observer']): string {
  if (p.kind === 'body') return getBody(p.id).name
  if (p.kind === 'craft') return getCraft(p.id)?.name ?? p.id
  if (p.kind === 'exoplanet') return getExoplanet(p.id)?.name ?? p.id
  return getStarVantage(p.id)?.name ?? p.id
}

/** Distance and light travel time in the unit a person would use at that scale. */
function distanceFacts(au: number): Record<string, number> {
  const km = au * KM_PER_AU
  const seconds = km / C_KM_S
  const out: Record<string, number> = {}
  if (au < 0.01) out.distance_km = Math.round(km)
  else if (au < 50_000) out.distance_au = round(au, 3)
  else out.distance_light_years = sig((au / AU_PER_PC) * LY_PER_PC, 3)
  if (seconds < 120) out.light_time_seconds = round(seconds, 1)
  else if (seconds < 7200) out.light_time_minutes = round(seconds / 60, 1)
  else if (seconds < 2 * 86_400) out.light_time_hours = round(seconds / 3600, 1)
  else out.light_time_years = sig(seconds / SECONDS_PER_YEAR, 3)
  return out
}

export function identifyFacts(req: IdentifyRequest, deps: IdentifyDeps): IdentifyFacts | null {
  const date = new Date(req.dateIso)
  const o = positionAu(req.observer, 'observer', date, deps)
  const t = positionAu(req.target, 'target', date, deps)
  if (!o || !t) return null
  const observer = req.observer.kind === 'body' || req.observer.kind === 'exoplanet' ? `On ${label(req.observer)}` : req.observer.kind === 'craft' ? `Aboard ${label(req.observer)}` : `Near ${label(req.observer)}`
  const facts: Record<string, number | string> = { ...distanceFacts(dist(o, t)) }

  if (req.target.kind === 'body') {
    const body = getBody(req.target.id)
    const seen = observe(body, t, o)
    if (seen.magnitude !== null) facts.apparent_magnitude = round(seen.magnitude, 1)
    facts.angular_diameter_arcsec = sig(seen.angularDiameterArcsec, 3)
    if (body.kind !== 'star') facts.illuminated_percent = Math.round(seen.illuminated * 100)
    // Registry telemetry joins the computed facts (nulls dropped: a star has no orbital period).
    const telemetry = Object.fromEntries(
      Object.entries(body.telemetry).filter((e): e is [string, number] => typeof e[1] === 'number'),
    )
    return { subject: body.name, observer, facts: { ...facts, ...telemetry } }
  }
  if (req.target.kind === 'star') {
    const s = deps.star(req.target.id)
    if (!s) return null
    const pc = dist(o, t) / AU_PER_PC
    facts.apparent_magnitude = round(s.absMag + 5 * Math.log10(pc / 10), 1)
    facts.absolute_magnitude = round(s.absMag, 1)
    facts.surface_temperature_k_estimate = Math.round(bvToTemperatureK(s.ci) / 100) * 100
    const echo = lightEcho(pc * LY_PER_PC, date)
    // Years in the form prose uses (2018, or 575 BCE), so the grounding check can match them.
    Object.assign(facts, historianYear('light_left_year', echo.departYear))
    if (echo.event) Object.assign(facts, { earth_event_then: echo.event.text }, historianYear('earth_event_year', echo.event.year))
    return { subject: req.target.id, observer, facts }
  }
  const craft = getCraft(req.target.id)
  if (!craft) return null
  facts.launched = craft.launched
  return { subject: craft.name, observer, facts }
}
