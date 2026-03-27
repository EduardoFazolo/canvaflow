import React, { useCallback } from 'react'
import { useViewStore, type ViewInstance } from '../stores/viewStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { switchCanvas, getMainCanvasId } from '../stores/canvasManager'
import type { AgentStatus } from '../../../modules/servers/agentic_signals/shared/types'

export const VIEW_TABBAR_H = 28

function CanvasTabIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1"/>
      <path d="M2.5 3.5h5M2.5 5h5M2.5 6.5h3" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" opacity="0.8"/>
    </svg>
  )
}

function SettingsTabIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <circle cx="5" cy="5" r="1.5" stroke="currentColor" strokeWidth="1"/>
      <path d="M5 0.5v1M5 8.5v1M0.5 5h1M8.5 5h1M1.9 1.9l.7.7M7.4 7.4l.7.7M8.1 1.9l-.7.7M2.6 7.4l-.7.7"
        stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

function GitBranchIcon(): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <circle cx="3" cy="2.5" r="1.2" stroke="currentColor" strokeWidth="1"/>
      <circle cx="3" cy="7.5" r="1.2" stroke="currentColor" strokeWidth="1"/>
      <circle cx="7" cy="3.5" r="1.2" stroke="currentColor" strokeWidth="1"/>
      <path d="M3 3.7v2.6M5.8 3.5C4.5 3.5 3 4 3 5.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

function tabIcon(inst: ViewInstance): React.ReactElement {
  if (inst.worktreePath) return <GitBranchIcon />
  if (inst.type === 'canvas') return <CanvasTabIcon />
  if (inst.type === 'settings') return <SettingsTabIcon />
  return <CanvasTabIcon />
}

const STATUS_COLORS: Record<string, string> = {
  idle: 'rgba(255,255,255,0.2)',
  thinking: '#f59e0b',
  executing: '#3b82f6',
  modifying_files: '#3b82f6',
  done: '#22c55e',
  error: '#ef4444',
  needs_permission: '#f59e0b',
  needs_input: '#f59e0b',
}

function StatusDot({ status }: { status?: AgentStatus }): React.ReactElement | null {
  if (!status) return null
  const color = STATUS_COLORS[status] || 'rgba(255,255,255,0.2)'
  const isPulsing = status === 'thinking' || status === 'executing' || status === 'modifying_files' || status === 'needs_permission' || status === 'needs_input'

  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        animation: isPulsing ? 'worktree-pulse 1.5s ease-in-out infinite' : undefined,
      }}
    />
  )
}

// Inject the pulse animation keyframes once
const PULSE_STYLE_ID = 'worktree-pulse-style'
if (typeof document !== 'undefined' && !document.getElementById(PULSE_STYLE_ID)) {
  const style = document.createElement('style')
  style.id = PULSE_STYLE_ID
  style.textContent = `@keyframes worktree-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`
  document.head.appendChild(style)
}

export function ViewTabBar(): React.ReactElement {
  const { instances, activeId, activate, close } = useViewStore()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeId)

  // Only show tabs that belong to the current workspace (or have no parent = global tabs)
  const visibleInstances = instances.filter((inst) =>
    !inst.parentWorkspaceId || inst.parentWorkspaceId === activeWorkspaceId
  )


  return (
    <div style={{
      height: VIEW_TABBAR_H,
      display: 'flex',
      alignItems: 'stretch',
      background: '#0a0a0a',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      flexShrink: 0,
      overflowX: 'auto',
    }}>
      {visibleInstances.map((inst) => {
        const isActive = inst.id === activeId
        const isWorktree = !!inst.worktreePath
        const labelColor = isWorktree
          ? (isActive ? '#22d3ee' : 'rgba(34,211,238,0.5)')
          : (isActive ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.35)')
        const accentColor = isWorktree ? '#22d3ee' : '#a78bfa'

        return (
          <div
            key={inst.id}
            onClick={() => {
              if (inst.type === 'canvas') {
                const canvasId = inst.worktreePath ? inst.id : getMainCanvasId()
                switchCanvas(canvasId)
                window.browser.setCanvasActive(true)
              } else {
                window.browser.setCanvasActive(false)
              }
              activate(inst.id)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '0 11px',
              cursor: 'pointer',
              userSelect: 'none',
              position: 'relative',
              borderRight: '1px solid rgba(255,255,255,0.05)',
              background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
              color: labelColor,
              fontSize: 11,
              fontWeight: isActive ? 500 : 400,
              whiteSpace: 'nowrap',
              transition: 'color 0.1s, background 0.1s',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.color = isWorktree
                  ? 'rgba(34,211,238,0.8)'
                  : 'rgba(255,255,255,0.6)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLElement).style.color = isWorktree
                  ? 'rgba(34,211,238,0.5)'
                  : 'rgba(255,255,255,0.35)'
              }
            }}
          >
            {/* Active indicator line at bottom */}
            {isActive && (
              <div style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0,
                height: 1.5,
                background: accentColor,
                borderRadius: '1px 1px 0 0',
              }} />
            )}

            {isWorktree && <StatusDot status={inst.agentStatus} />}

            <span style={{ color: isActive ? (isWorktree ? 'rgba(34,211,238,0.6)' : 'rgba(255,255,255,0.5)') : 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
              {tabIcon(inst)}
            </span>

            {inst.label}

            {inst.closeable && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  // If closing the active tab, switch canvas back to main BEFORE closing
                  if (inst.id === activeId) {
                    switchCanvas(getMainCanvasId())
                  }
                  close(inst.id)
                }}
                style={{
                  width: 13, height: 13,
                  border: 'none', background: 'transparent',
                  color: 'rgba(255,255,255,0.25)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0, borderRadius: 3, flexShrink: 0, marginLeft: 2,
                }}
                onMouseEnter={(e) => {
                  Object.assign((e.currentTarget as HTMLElement).style, { color: 'rgba(255,255,255,0.75)', background: 'rgba(255,255,255,0.1)' })
                }}
                onMouseLeave={(e) => {
                  Object.assign((e.currentTarget as HTMLElement).style, { color: 'rgba(255,255,255,0.25)', background: 'transparent' })
                }}
              >
                <svg width="7" height="7" viewBox="0 0 7 7">
                  <path d="M1 1l5 5M6 1l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
