import { describe, expect, it } from 'vitest'
import { getBody } from '../config'
import { computeLiveTelemetry } from './liveTelemetry'

const perihelion = new Date('2025-01-04T13:28:00Z')

describe('live telemetry', () => {
  it("reports Earth's perihelion distance and orbital speed", () => {
    const t = computeLiveTelemetry(getBody('earth'), perihelion)
    expect(Math.abs(t.distanceFromSunKm - 147_103_686)).toBeLessThan(20_000)
    // Earth's heliocentric speed peaks near 30.29 km/s at perihelion.
    expect(t.heliocentricSpeedKms).toBeGreaterThan(30.1)
    expect(t.heliocentricSpeedKms).toBeLessThan(30.4)
    expect(t.distanceFromEarthKm).toBeNull()
  })

  it('gives the Moon a light time of about 1.3 seconds from Earth', () => {
    const t = computeLiveTelemetry(getBody('moon'), perihelion)
    expect(t.lightTimeFromEarthS).toBeGreaterThan(1.18)
    expect(t.lightTimeFromEarthS).toBeLessThan(1.36)
  })
})
