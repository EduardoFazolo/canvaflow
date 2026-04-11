import React from 'react'
import { useCameraStore } from '../stores/cameraStore'
import { Canvas } from '../components/Canvas'
import { GridRenderer } from '../components/GridRenderer'
import { GitOverlay } from '../components/GitOverlay'
import { ZoomIndicator } from '../components/ZoomIndicator'

export function CanvasView(): React.ReactElement {
  const camera = useCameraStore((s) => s.camera)

  return (
    <div
      data-canvas-root
      style={{ flex: 1, width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
    >
      <GridRenderer camera={camera} />
      <Canvas />
      <GitOverlay />
      <ZoomIndicator />
    </div>
  )
}
