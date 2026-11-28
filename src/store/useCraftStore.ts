import { create } from 'zustand'
import { spacecraftConfig } from '../config'
import { SpacecraftDataSchema } from '../schemas/explore'
import type { CraftTrack } from '../lib/spacecraft'

type CraftState = {
  tracks: CraftTrack[] | null
  error: string | null
  load: () => Promise<void>
}

let pending: Promise<void> | null = null

/** JPL Horizons trajectories, fetched once on first use (~290 KB). */
export const useCraftStore = create<CraftState>()((set) => ({
  tracks: null,
  error: null,
  load: () =>
    (pending ??= fetch(spacecraftConfig.dataUrl)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Spacecraft data HTTP ${res.status}`)
        set({ tracks: SpacecraftDataSchema.parse(await res.json()).craft, error: null })
      })
      .catch((e: unknown) => {
        pending = null
        set({ error: e instanceof Error ? e.message : String(e) })
      })),
}))
