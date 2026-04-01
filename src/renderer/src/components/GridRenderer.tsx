import React, { useEffect, useRef } from 'react'
import { Application, Graphics } from 'pixi.js'
import { Camera } from '../stores/cameraStore'

interface Props {
  camera: Camera
}

export function GridRenderer({ camera }: Props): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const gridRef = useRef<Graphics | null>(null)
  const cameraRef = useRef(camera)
  cameraRef.current = camera

  useEffect(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    let cancelled = false
    let resizeTimer: ReturnType<typeof setTimeout> | null = null

    const app = new Application()
    const w = container.offsetWidth || window.innerWidth
    const h = container.offsetHeight || window.innerHeight

    app.init({
      width: w,
      height: h,
      backgroundColor: 0x0d0d0d,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    }).then(() => {
      if (cancelled) { try { app.destroy(true) } catch {} return }

      const canvas = app.canvas as HTMLCanvasElement
      canvas.style.position = 'absolute'
      canvas.style.inset = '0'
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      canvas.style.pointerEvents = 'none'
      container.appendChild(canvas)

      const grid = new Graphics()
      app.stage.addChild(grid)
      gridRef.current = grid
      appRef.current = app

      drawGrid(grid, app.screen.width, app.screen.height, cameraRef.current)

      // Resize PixiJS after the sidebar animation finishes (200ms CSS transition).
      // Debounced to 250ms so we don't resize on every intermediate frame, which
      // would cause a black flash during the animation.
      // After resize(), autoDensity resets canvas CSS to fixed px — re-apply 100%.
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        const { width, height } = entry.contentRect
        if (width < 1 || height < 1) return
        if (resizeTimer) clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => {
          resizeTimer = null
          if (!appRef.current || !gridRef.current) return
          appRef.current.renderer.resize(width, height)
          const c = appRef.current.canvas as HTMLCanvasElement
          c.style.width = '100%'
          c.style.height = '100%'
          drawGrid(gridRef.current, appRef.current.screen.width, appRef.current.screen.height, cameraRef.current)
        }, 250)
      })
      observer.observe(container)
      ;(container as any).__gridObserver = observer
    })

    return () => {
      cancelled = true
      if (resizeTimer) clearTimeout(resizeTimer)
      const obs = (container as any).__gridObserver as ResizeObserver | undefined
      if (obs) { obs.disconnect(); delete (container as any).__gridObserver }
      if (appRef.current) {
        try { appRef.current.destroy(true) } catch {}
        appRef.current = null
        gridRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!appRef.current || !gridRef.current) return
    const app = appRef.current
    const grid = gridRef.current
    drawGrid(grid, app.screen.width, app.screen.height, camera)
  }, [camera])

  return <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
}

// pixi.js v8 drawing API: build path with g.circle(), then g.fill()
function drawGrid(g: Graphics, width: number, height: number, camera: Camera) {
  g.clear()

  const baseSize = 40
  const zoom = camera.zoom
  if (!zoom || !isFinite(zoom)) return

  let step = baseSize
  while (step * zoom < 20) step *= 4
  while (step * zoom > 120) step /= 2

  const dotRadius = zoom > 0.5 ? 1 : 0.5

  const offsetX = ((camera.x % (step * zoom)) + step * zoom) % (step * zoom)
  const offsetY = ((camera.y % (step * zoom)) + step * zoom) % (step * zoom)

  const cols = Math.ceil(width / (step * zoom)) + 2
  const rows = Math.ceil(height / (step * zoom)) + 2

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const x = offsetX + col * step * zoom - step * zoom
      const y = offsetY + row * step * zoom - step * zoom
      g.circle(x, y, dotRadius)
    }
  }
  g.fill({ color: 0x444444 })
}
