import { create } from 'zustand'
import { aiConfig, getBody, registry, rootBody, sceneConfig } from '../config'
import type { Pov, ScaleJumpLevel, ScaleMode } from '../schemas/scene'
import { anchorAt, simTimeMs, type SimClock } from '../lib/simClock'
import { VANTAGE_STAR_TARGET } from '../components/canvas/simContext'

export type Panel = 'guide' | 'gallery' | 'explore' | null

/** Where the first-person camera stands: on a body, near another star, on an exoplanet, or aboard a spacecraft. */
export type Vantage = {
  kind: 'body' | 'star' | 'craft' | 'exoplanet'
  id: string
  /** Override for how high the target stands above the horizon (Earthrise). */
  elevationDeg?: number
  /** Stand at a fixed place instead (eclipse paths), degrees, east longitude. */
  latDeg?: number
  lonDeg?: number
}

/** Look targets are body ids or `craft:<id>`. */
export const craftKey = (id: string) => `craft:${id}`

type SpaceState = SimClock & {
  selectedBodyId: string
  scaleMode: ScaleMode
  pov: Pov
  scaleJumpLevel: ScaleJumpLevel
  ageTierId: string
  panel: Panel
  fdeOpen: boolean
  /** Rate to restore when un-pausing. */
  resumeRate: number
  vantage: Vantage
  /** Target the telescope tracks; null once the user looks around by hand. */
  lookTargetId: string | null
  fovDeg: number
  /** Scale mode to restore on leaving first person (first person is always true scale). */
  scaleBeforeVantage: ScaleMode
  galaxyFocusId: string | null
  /** Orbital view around a spacecraft (outside view of its 3D model) instead of a body. */
  craftFocusId: string | null
  /** First person: what was tapped in the sky (identify card). Stars by catalog name. */
  identified: { kind: 'body' | 'star' | 'craft'; id: string } | null
  setIdentified: (v: { kind: 'body' | 'star' | 'craft'; id: string } | null) => void
  /** First person: name planets and bright stars in the sky. */
  showLabels: boolean
  toggleLabels: () => void
  inspectCraft: (id: string) => void
  select: (id: string) => void
  cycleSelection: (step: 1 | -1) => void
  setScaleMode: (mode: ScaleMode) => void
  setPov: (pov: Pov) => void
  setScaleJumpLevel: (level: ScaleJumpLevel) => void
  setAgeTier: (id: string) => void
  setPanel: (panel: Panel) => void
  toggleFde: () => void
  setTimeRate: (rate: number) => void
  togglePause: () => void
  jumpTo: (ms: number) => void
  resetToNow: () => void
  setVantage: (v: Vantage) => void
  setLookTarget: (id: string | null) => void
  setFov: (deg: number) => void
  setGalaxyFocus: (id: string | null) => void
}

const ids = registry.bodies.map((b) => b.id)
const now = () => performance.now()
const { optics, vantage: vantageCfg } = sceneConfig

export const hasSurfacePov = (id: string): boolean => getBody(id).kind !== 'star'
export const clampFov = (deg: number) => Math.min(optics.maxFovDeg, Math.max(optics.minFovDeg, deg))

export function defaultLookTarget(v: Vantage): string {
  if (v.kind === 'star') return rootBody.id
  if (v.kind === 'exoplanet') return VANTAGE_STAR_TARGET
  if (v.kind === 'body' && v.id === vantageCfg.earthId) return vantageCfg.earthVantageTargetId
  return vantageCfg.earthId
}

export const useSpaceStore = create<SpaceState>()((set, get) => ({
  ...anchorAt(Date.now(), sceneConfig.time.defaultRate, now()),
  resumeRate: sceneConfig.time.defaultRate,
  selectedBodyId: sceneConfig.camera.initialBodyId,
  scaleMode: 'navigable',
  pov: 'orbital',
  scaleJumpLevel: 'planetary',
  ageTierId: aiConfig.defaultTierId,
  panel: null,
  fdeOpen: false,
  vantage: { kind: 'body', id: sceneConfig.vantage.earthId },
  lookTargetId: null,
  fovDeg: optics.eyeFovDeg,
  scaleBeforeVantage: 'navigable',
  galaxyFocusId: null,
  craftFocusId: null,
  identified: null,
  setIdentified: (identified) => set({ identified }),
  showLabels: true,
  toggleLabels: () => set({ showLabels: !get().showLabels }),
  inspectCraft: (id) => {
    const s = get()
    if (s.pov === 'vantage') s.setPov('orbital')
    set({ pov: 'orbital', craftFocusId: id })
  },
  // In first person, picking a body points the telescope at it; elsewhere it focuses the camera.
  select: (id) => {
    if (get().pov === 'vantage') set({ selectedBodyId: id, lookTargetId: id })
    else set({ selectedBodyId: id, pov: 'orbital', craftFocusId: null })
  },
  cycleSelection: (step) => {
    const i = ids.indexOf(get().selectedBodyId)
    const next = ids[(i + step + ids.length) % ids.length]
    if (next) get().select(next)
  },
  setScaleMode: (scaleMode) => {
    if (get().pov !== 'vantage') set({ scaleMode })
  },
  setPov: (pov) => {
    const s = get()
    if (pov === s.pov) return
    if (pov === 'vantage') {
      const id = hasSurfacePov(s.selectedBodyId) ? s.selectedBodyId : vantageCfg.earthId
      s.setVantage({ kind: 'body', id })
      return
    }
    set({ pov, craftFocusId: null, ...(s.pov === 'vantage' ? { scaleMode: s.scaleBeforeVantage, fovDeg: optics.eyeFovDeg } : {}) })
  },
  setVantage: (vantage) => {
    if (vantage.kind === 'body' && !hasSurfacePov(vantage.id)) return
    const s = get()
    set({
      vantage,
      pov: 'vantage',
      craftFocusId: null,
      identified: null,
      lookTargetId: defaultLookTarget(vantage),
      scaleBeforeVantage: s.pov === 'vantage' ? s.scaleBeforeVantage : s.scaleMode,
      scaleMode: 'true',
      ...(vantage.kind === 'body' ? { selectedBodyId: vantage.id } : {}),
    })
  },
  setLookTarget: (lookTargetId) => set({ lookTargetId }),
  setFov: (deg) => set({ fovDeg: clampFov(deg) }),
  setScaleJumpLevel: (scaleJumpLevel) => {
    if (get().pov === 'vantage') get().setPov('scaleJump')
    // Picking a level (even the current one) returns the Local Group view to its overview.
    set({ pov: 'scaleJump', scaleJumpLevel, galaxyFocusId: null, craftFocusId: null })
  },
  setGalaxyFocus: (galaxyFocusId) => set({ galaxyFocusId }),
  setAgeTier: (ageTierId) => set({ ageTierId }),
  setPanel: (panel) => set({ panel }),
  toggleFde: () => set({ fdeOpen: !get().fdeOpen }),
  setTimeRate: (rate) => set({ ...anchorAt(simTimeMs(get(), now()), rate, now()), resumeRate: rate === 0 ? get().resumeRate : rate }),
  togglePause: () => {
    const s = get()
    s.setTimeRate(s.timeRate === 0 ? s.resumeRate : 0)
  },
  jumpTo: (ms) => set(anchorAt(ms, get().timeRate, now())),
  resetToNow: () => set(anchorAt(Date.now(), get().timeRate, now())),
}))

export function simDateNow(): Date {
  return new Date(simTimeMs(useSpaceStore.getState(), now()))
}
