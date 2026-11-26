import { KM_PER_AU } from 'astronomy-engine'

const n1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const n3 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })
const n0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const sci = new Intl.NumberFormat('en-US', { notation: 'scientific', maximumFractionDigits: 3 })

export const fmt1 = (v: number) => n1.format(v)
export const fmtSci = (v: number) => sci.format(v)

/** Distances: km below 0.01 AU (Moon scale), AU above. */
export function formatDistance(km: number): string {
  const au = km / KM_PER_AU
  return au < 0.01 ? `${n0.format(km)} km` : `${n3.format(au)} AU`
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${n1.format(seconds)} s`
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m < 60) return `${m} min ${s} s`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

/** Local display of a UTC instant (the browser knows the user's zone). */
export const formatSimDate = (d: Date) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(d)
