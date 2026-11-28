import { beforeEach, describe, expect, it } from 'vitest'
import { sceneConfig } from '../config'
import { useSpaceStore } from './useSpaceStore'

const s = () => useSpaceStore.getState()
const initial = useSpaceStore.getState()

describe('first-person store transitions', () => {
  beforeEach(() => useSpaceStore.setState(initial, true))

  it('locks true scale while in first person and restores the previous scale on exit', () => {
    s().setScaleMode('navigable')
    s().select('mars')
    s().setPov('vantage')
    expect(s().vantage).toEqual({ kind: 'body', id: 'mars' })
    expect(s().scaleMode).toBe('true')
    s().setScaleMode('navigable')
    expect(s().scaleMode).toBe('true')
    s().setPov('orbital')
    expect(s().scaleMode).toBe('navigable')
    expect(s().fovDeg).toBe(sceneConfig.optics.eyeFovDeg)
  })

  it('points at Earth by default, and at the Moon when standing on Earth', () => {
    s().setVantage({ kind: 'body', id: 'mars' })
    expect(s().lookTargetId).toBe('earth')
    s().setVantage({ kind: 'body', id: 'earth' })
    expect(s().lookTargetId).toBe('moon')
    s().setVantage({ kind: 'star', id: 'sirius' })
    expect(s().lookTargetId).toBe('sun')
  })

  it('refuses to stand on the Sun and turns body clicks into telescope targets', () => {
    s().setVantage({ kind: 'body', id: 'sun' })
    expect(s().pov).toBe('orbital')
    s().setVantage({ kind: 'craft', id: 'voyager-1' })
    s().select('jupiter')
    expect(s().pov).toBe('vantage')
    expect(s().lookTargetId).toBe('jupiter')
  })

  it('keeps the Earthrise elevation override and points at Earth from the Moon', () => {
    s().setVantage({ kind: 'body', id: 'moon', elevationDeg: sceneConfig.vantage.earthriseElevationDeg })
    expect(s().vantage.elevationDeg).toBe(sceneConfig.vantage.earthriseElevationDeg)
    expect(s().lookTargetId).toBe('earth')
    expect(s().scaleMode).toBe('true')
  })

  it('keeps the sky-labels choice when moving between vantages', () => {
    s().setVantage({ kind: 'body', id: 'mars' })
    s().toggleLabels()
    s().setVantage({ kind: 'body', id: 'moon' })
    expect(s().showLabels).toBe(false)
  })

  it('clamps zoom to the optics limits', () => {
    s().setFov(1e-9)
    expect(s().fovDeg).toBe(sceneConfig.optics.minFovDeg)
    s().setFov(1e9)
    expect(s().fovDeg).toBe(sceneConfig.optics.maxFovDeg)
  })
})
