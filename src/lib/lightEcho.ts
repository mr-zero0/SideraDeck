import { lightEchoesConfig } from '../config'
import type { LightEchoes } from '../schemas/explore'

export type LightEchoEvent = LightEchoes['events'][number]

export type LightEcho = {
  /** Astronomical year (0 = 1 BCE) the light set out. */
  departYear: number
  /** Year as people write it, rounded to the precision the distance supports. */
  label: string
  /** The dated Earth event nearest that year, if one falls inside the match window. */
  event: LightEchoEvent | null
  beforeHistory: boolean
}

export const LY_PER_PC = 3.261_563_8
const MS_PER_YEAR = 365.25 * 86_400_000

/** Astronomical year -> "1480" / "585 BCE", rounded to `step` years. */
export function formatYear(year: number, step: number): string {
  if (year > 0) return String(Math.round(year / step) * step)
  return `${Math.max(1, Math.round((1 - year) / step) * step)} BCE`
}

// Catalog distances are good to a few percent, so far stars get a rounder year.
const stepFor = (lightYears: number) => (lightYears < 100 ? 1 : lightYears < 1000 ? 10 : 100)

export function lightEcho(lightYears: number, now: Date, cfg: LightEchoes = lightEchoesConfig): LightEcho {
  const yearStart = Date.UTC(now.getUTCFullYear(), 0, 1)
  const departYear = Math.round(now.getUTCFullYear() + (now.getTime() - yearStart) / MS_PER_YEAR - lightYears)
  const window = Math.max(cfg.matchWindow.minYears, cfg.matchWindow.fractionOfLightTime * lightYears)
  const nearest = cfg.events.reduce((best, e) => (Math.abs(e.year - departYear) < Math.abs(best.year - departYear) ? e : best))
  return {
    departYear,
    label: formatYear(departYear, stepFor(lightYears)),
    event: Math.abs(nearest.year - departYear) <= window ? nearest : null,
    beforeHistory: departYear < nearest.year - window && nearest === cfg.events[0],
  }
}
