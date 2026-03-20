import React, { useState, useCallback } from 'react'
import { Sidebar, SIDEBAR_W } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { CommandPalette } from './components/CommandPalette'
import { ViewTabBar } from './components/ViewTabBar'
import { ViewLayer } from './components/ViewLayer'
import { useAutoSave } from './hooks/useAutoSave'
import { useWorkspaceInit } from './hooks/useWorkspaceInit'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useViewStore } from './stores/viewStore'

export default function App(): React.ReactElement {
  useWorkspaceInit()
  useAutoSave()

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const openPalette = useCallback(() => setPaletteOpen(true), [])
  const openSettings = useCallback(() => useViewStore.getState().open(
    { id: 'settings', type: 'settings', label: 'Settings', closeable: true }
  ), [])

  useKeyboardShortcuts({ onSearch: openPalette, onSettings: openSettings })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', overflow: 'hidden' }}>
      <TitleBar
        sidebarOpen={sidebarOpen}
        sidebarWidth={SIDEBAR_W}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div
          data-sidebar
          style={{
            width: sidebarOpen ? SIDEBAR_W : 0,
            overflow: 'hidden',
            transition: 'width 0.2s ease',
            flexShrink: 0,
          }}
        >
          <Sidebar />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <ViewTabBar />
          <ViewLayer />
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
