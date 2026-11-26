import { sceneConfig } from '../config'

/** Sim time = simAnchorMs + (realNow - realAnchorMs) * timeRate, clamped to the supported range. */
export type SimClock = { simAnchorMs: number; realAnchorMs: number; timeRate: number }

const MIN = Date.parse(sceneConfig.time.minDate)
const MAX = Date.parse(sceneConfig.time.maxDate)

export const clampSimMs = (ms: number): number => Math.min(MAX, Math.max(MIN, ms))

export const simTimeMs = (c: SimClock, realNowMs: number): number =>
  clampSimMs(c.simAnchorMs + (realNowMs - c.realAnchorMs) * c.timeRate)

/** Re-anchoring on every rate or date change keeps the clock continuous (no jump when the rate changes). */
export const anchorAt = (simMs: number, timeRate: number, realNowMs: number): SimClock => ({
  simAnchorMs: clampSimMs(simMs),
  realAnchorMs: realNowMs,
  timeRate,
})
