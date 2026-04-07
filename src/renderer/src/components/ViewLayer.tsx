import React from 'react'
import { useViewStore } from '../stores/viewStore'
import { CanvasView } from '../views/CanvasView'
import { SettingsView } from '../views/SettingsView'
import { CodeReviewView } from '../views/CodeReviewView'

/**
 * ViewLayer just renders the active view. No canvas switching logic —
 * that's handled by canvasManager, called from tab clicks and kanban flow.
 */
export function ViewLayer(): React.ReactElement {
  const { instances, activeId } = useViewStore()
  const activeInst = instances.find((i) => i.id === activeId)
  const isCanvasActive = activeInst?.type === 'canvas'
  const isSettingsOpen = instances.some((i) => i.type === 'settings')
  const isCodeReviewOpen = instances.some((i) => i.type === 'code-review')

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
      <div style={{
        position: 'absolute', inset: 0,
        display: isCanvasActive ? 'flex' : 'none',
        flexDirection: 'column',
      }}>
        <CanvasView />
      </div>

      {isSettingsOpen && (
        <div style={{
          position: 'absolute', inset: 0,
          display: activeInst?.type === 'settings' ? 'flex' : 'none',
          flexDirection: 'column',
        }}>
          <SettingsView />
        </div>
      )}

      {isCodeReviewOpen && (
        <div style={{
          position: 'absolute', inset: 0,
          display: activeInst?.type === 'code-review' ? 'flex' : 'none',
          flexDirection: 'column',
        }}>
          <CodeReviewView />
        </div>
      )}
    </div>
  )
}
