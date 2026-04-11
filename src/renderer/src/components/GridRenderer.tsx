import React, { useMemo } from 'react'
import { Camera } from '../stores/cameraStore'

interface Props {
  camera: Camera
}

/**
 * The canvas background dot grid.
 *
 * Deliberately rendered as a single CSS-backed <div> using a tiled
 * radial-gradient — NOT a WebGL/pixi canvas. This is intentional:
 *
 *   - There is no texture, image, context, or GPU resource that can get lost,
 *     fail to initialize, or render as a "broken image" icon on context loss.
 *   - It's literally a background-color + background-image on a div. The
 *     browser's own CSS engine guarantees it always paints.
 *   - Zero allocations, zero frames of latency — pan/zoom updates are just
 *     style prop changes, which the compositor handles for free.
 *
 * If you're tempted to rewrite this using pixi, canvas2d, or any other
 * imperative drawing API to get "nicer" dots: don't. The previous version
 * did exactly that and broke in the wild when the WebGL context was dropped
 * (GPU sleep, driver glitch, window re-parenting). The grid is decorative —
 * robustness beats pixel-perfection here.
 */
export function GridRenderer({ camera }: Props): React.ReactElement {
  const style = useMemo<React.CSSProperties>(() => {
    const zoom = camera.zoom
    if (!zoom || !isFinite(zoom) || zoom <= 0) {
      // Degenerate camera — just paint the base color, no grid.
      return {
        position: 'absolute',
        inset: -200,
        background: '#0d0d0d',
        pointerEvents: 'none',
      }
    }

    // Pick a grid step (in world units) such that the screen-space spacing
    // stays within a readable 20–120 px range regardless of zoom level.
    const baseSize = 40
    let step = baseSize
    while (step * zoom < 20) step *= 4
    while (step * zoom > 120) step /= 2

    const stepPx = step * zoom
    const offsetX = (((camera.x % stepPx) + stepPx) % stepPx)
    const offsetY = (((camera.y % stepPx) + stepPx) % stepPx)

    // A 1px dot centered in each tile, fading to transparent by ~1.5px.
    // The fade softens aliasing without needing antialiased canvas drawing.
    return {
      position: 'absolute',
      inset: -200,
      backgroundColor: '#0d0d0d',
      backgroundImage:
        'radial-gradient(circle, rgba(68,68,68,1) 1px, transparent 1.5px)',
      backgroundSize: `${stepPx}px ${stepPx}px`,
      backgroundPosition: `${offsetX}px ${offsetY}px`,
      pointerEvents: 'none',
    }
  }, [camera.x, camera.y, camera.zoom])

  return <div style={style} />
}
