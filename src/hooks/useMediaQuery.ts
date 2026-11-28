import { useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Phone-width layout (below Tailwind's `sm` breakpoint). */
export const COMPACT_QUERY = '(max-width: 639px)'
export const useCompact = () => useMediaQuery(COMPACT_QUERY)
export const useCoarsePointer = () => useMediaQuery('(pointer: coarse)')
