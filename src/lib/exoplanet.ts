import type { Exoplanet } from '../schemas/explore'
import { raDecToEqj, type Vec3 } from './frames'

/** Host star position, J2000 equatorial parsecs (Sun at origin), the frame the HYG catalog uses. */
export function hostEquatorialPc(host: Exoplanet['host']): Vec3 {
  const [x, y, z] = raDecToEqj(host.raDeg, host.decDeg)
  return [x * host.distancePc, y * host.distancePc, z * host.distancePc]
}
