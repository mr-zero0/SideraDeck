import { create } from 'zustand'
import type { StarLookup } from '../shared/identify'

type StarNamesState = {
  /** Proper names of bright catalog stars (name -> catalog index), set once the star catalog loads. */
  names: [string, number][]
  /** Catalog lookup by proper name (J2000 equatorial parsecs), for identify facts. */
  lookup: StarLookup
  set: (names: [string, number][], lookup: StarLookup) => void
}

export const useStarNames = create<StarNamesState>()((set) => ({
  names: [],
  lookup: () => null,
  set: (names, lookup) => set({ names, lookup }),
}))
