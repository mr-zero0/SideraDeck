import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { snapshot, useSim, type SnapshotLabel } from './simContext'

const TRANSLATE = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/

/**
 * Lets the HUD grab the current view as a PNG. The WebGL buffer is cleared after each composite, so
 * we render a frame and read it back in the same task (no preserveDrawingBuffer cost every frame).
 */
export function SnapshotBridge() {
  const sim = useSim()
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    snapshot.capture = () => {
      gl.render(scene, camera)
      const canvas = gl.domElement
      const png = canvas.toDataURL('image/png')
      const labels: SnapshotLabel[] = []
      for (const el of sim.labels.values()) {
        if (el.style.visibility !== 'visible') continue
        const m = TRANSLATE.exec(el.style.transform)
        const text = el.textContent?.trim()
        if (m && text) labels.push({ text, x: Number(m[1]), y: Number(m[2]), star: el.dataset.star === 'true' })
      }
      return { png, width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight, labels }
    }
    return () => {
      snapshot.capture = null
    }
  }, [gl, scene, camera, sim])
  return null
}
