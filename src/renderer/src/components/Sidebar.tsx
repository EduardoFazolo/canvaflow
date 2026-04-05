import React, { useState, useEffect, useRef } from 'react'
import { useWorkspaceStore, Workspace, NodeSummary } from '../stores/workspaceStore'
import { useViewStore } from '../stores/viewStore'
import { useNodeStore, NodeData } from '../stores/nodeStore'
import { useTemplateStore, NodeTemplate } from '../stores/templateStore'
import { useSessionStore, BrowserSession } from '../stores/sessionStore'
import { useCameraStore } from '../stores/cameraStore'
import { loadWorkspaceCanvas } from '../hooks/useWorkspaceInit'
import { getCanvasRect } from '../utils/canvasUtils'
import { getSidebarAgentStatusUi } from '../../../modules/servers/agentic_signals/renderer/sidebarStatusUi'

function jumpToNode(node: NodeData): void {
  const zoom = Math.max(useCameraStore.getState().camera.zoom, 0.7)
  const { width: vw, height: vh } = getCanvasRect()
  useCameraStore.getState().setCamera({
    zoom,
    x: vw / 2 - (node.x + node.width / 2) * zoom,
    y: vh / 2 - (node.y + node.height / 2) * zoom,
  })
  useNodeStore.getState().setFocusedNodeId(node.id)
}

export const SIDEBAR_W = 240

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function FolderIcon({ open }: { open: boolean }): React.ReactElement {
  return open ? (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M1 3.5C1 2.67 1.67 2 2.5 2H5l1.5 1.5H10.5C11.33 3.5 12 4.17 12 5v5c0 .83-.67 1.5-1.5 1.5h-8C1.67 11.5 1 10.83 1 10V3.5z"
        fill="rgba(255,255,255,0.25)" stroke="none"/>
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M1 3.5C1 2.67 1.67 2 2.5 2H5l1.5 1.5H10.5C11.33 3.5 12 4.17 12 5v5c0 .83-.67 1.5-1.5 1.5h-8C1.67 11.5 1 10.83 1 10V3.5z"
        stroke="rgba(255,255,255,0.3)" strokeWidth="1" fill="none"/>
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }): React.ReactElement {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
      <path d="M3.5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function NodeTypeIcon({ type }: { type: string }): React.ReactElement {
  if (type === 'terminal') {
    return (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <path d="M1.5 3l3 2.5-3 2.5M5.5 8h4" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
  if (type === 'browser' || type === 'browserv2') {
    return (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <rect x="1" y="1" width="9" height="9" rx="2" stroke="rgba(255,255,255,0.35)" strokeWidth="1.1"/>
        <path d="M1 4h9" stroke="rgba(255,255,255,0.35)" strokeWidth="1.1"/>
        <circle cx="3" cy="2.5" r="0.7" fill="rgba(255,255,255,0.35)"/>
      </svg>
    )
  }
  if (type === 'files') {
    return (
      <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
        <path d="M1 1.5C1 1.22 1.22 1 1.5 1H4L5 2.5H10.5C10.78 2.5 11 2.72 11 3V8.5C11 8.78 10.78 9 10.5 9H1.5C1.22 9 1 8.78 1 8.5V1.5Z" stroke="rgba(255,255,255,0.35)" strokeWidth="1.1" fill="none"/>
      </svg>
    )
  }
  if (type === 'notion') {
    return (
      <svg width="11" height="11" viewBox="0 0 14 14" fill="rgba(255,255,255,0.35)">
        <path d="M3.08 2.17c1.65-.12 4.16-.18 5.62-.16 1.58.02 2.08.44 2.14 1.95.08 1.68.08 4.22 0 5.9-.06 1.48-.52 1.91-2.03 1.96-1.61.06-4.15.06-5.79 0-1.43-.05-1.95-.5-2.02-1.86-.08-1.73-.09-4.36 0-6.08.07-1.34.59-1.6 2.08-1.71Zm.45 1.36v6.95h6.94V3.53H3.53Zm1.26 1.17h3.95v.91H6.99v3.09h-.98V5.61H4.79V4.7Z"/>
      </svg>
    )
  }
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <rect x="1.5" y="1.5" width="8" height="8" rx="1.5" stroke="rgba(255,255,255,0.35)" strokeWidth="1.1"/>
    </svg>
  )
}

function PlusIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Add Workspace Dialog
// ---------------------------------------------------------------------------

function AddWorkspaceDialog({ onClose }: { onClose: () => void }): React.ReactElement {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [picking, setPicking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const pickDir = async () => {
    setPicking(true)
    try {
      const chosen = await window.workspace.openDialog()
      if (chosen) {
        setPath(chosen)
        if (!name) setName(chosen.split('/').pop() || chosen)
      }
    } finally {
      setPicking(false)
    }
  }

  const confirm = async () => {
    if (!path) return
    const displayName = name.trim() || path.split('/').pop() || path
    const ws: Workspace = {
      id: crypto.randomUUID(),
      name: displayName,
      path,
      lastOpenedAt: Date.now(),
      color: null,
      description: null,
    }
    await window.workspace.save(ws)
    useWorkspaceStore.setState((s) => ({
      workspaces: [...s.workspaces, ws],
      activeId: ws.id,
      nodeSummaries: { ...s.nodeSummaries, [ws.id]: [] },
    }))
    await loadWorkspaceCanvas(ws.id)
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)',
      }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#1a1a1a',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: 20,
        width: 380,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 2 }}>
          Add workspace
        </div>

        <button onClick={pickDir} disabled={picking} style={{
          height: 34, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.05)', color: path ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)',
          fontSize: 12, cursor: 'pointer', textAlign: 'left', padding: '0 10px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: 'inherit',
        }}>
          {path || (picking ? 'Choosing…' : 'Choose directory…')}
        </button>

        <input ref={inputRef} type="text" placeholder="Name (optional)"
          value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') onClose() }}
          style={{
            height: 34, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)',
            fontSize: 12, padding: '0 10px', outline: 'none', fontFamily: 'inherit',
          }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onClose} style={{
            height: 30, padding: '0 14px', borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
            color: 'rgba(255,255,255,0.45)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button onClick={confirm} disabled={!path} style={{
            height: 30, padding: '0 14px', borderRadius: 6,
            border: 'none', background: path ? '#a78bfa' : 'rgba(167,139,250,0.3)',
            color: '#fff', fontSize: 12, cursor: path ? 'pointer' : 'default', fontFamily: 'inherit',
          }}>Add</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete confirm
// ---------------------------------------------------------------------------

function DeleteConfirm({ workspace, onConfirm, onCancel }: {
  workspace: Workspace; onConfirm: () => void; onCancel: () => void
}): React.ReactElement {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.65)',
    }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 10, padding: 20, width: 340,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
          Remove workspace?
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.55 }}>
          <span style={{ color: 'rgba(255,255,255,0.65)' }}>{workspace.name}</span> will be removed.
          The directory on disk is not affected.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            height: 30, padding: '0 14px', borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.1)', background: 'transparent',
            color: 'rgba(255,255,255,0.45)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            height: 30, padding: '0 14px', borderRadius: 6,
            border: 'none', background: 'rgba(239,68,68,0.8)',
            color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>Remove</button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// WorkspaceSection
// ---------------------------------------------------------------------------

interface SectionProps {
  workspace: Workspace
  isActive: boolean
  nodes: NodeSummary[]
  onSwitch: () => void
  onDelete: () => void
}

function WorkspaceSection({ workspace, isActive, nodes, onSwitch, onDelete }: SectionProps): React.ReactElement {
  const [open, setOpen] = useState(isActive)
  const [headerHovered, setHeaderHovered] = useState(false)
  const [deleteHovered, setDeleteHovered] = useState(false)

  // Auto-expand when becoming active
  useEffect(() => { if (isActive) setOpen(true) }, [isActive])

  return (
    <div style={{ width: '100%' }}>
      {/* Workspace header row */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          height: 30, padding: '0 10px 0 8px',
          cursor: 'pointer',
          background: isActive && headerHovered
            ? 'rgba(255,255,255,0.07)'
            : headerHovered
              ? 'rgba(255,255,255,0.05)'
              : 'transparent',
          borderRadius: 5,
          margin: '0 4px',
          position: 'relative',
        }}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
        onClick={() => { setOpen((o) => !o); if (!isActive) onSwitch() }}
      >
        {/* Active indicator */}
        {isActive && (
          <div style={{
            position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
            width: 2.5, height: 16, borderRadius: 2, background: '#a78bfa',
          }} />
        )}

        <span
          style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0, cursor: 'pointer' }}
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        >
          <ChevronIcon open={open} />
        </span>

        <span style={{ flexShrink: 0, marginTop: 1 }}>
          <FolderIcon open={open} />
        </span>

        <span style={{
          flex: 1, fontSize: 12, fontWeight: isActive ? 500 : 400,
          color: isActive ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.5)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          letterSpacing: '0.01em',
        }}>
          {workspace.name}
        </span>

        {/* Delete button — only on hover */}
        {headerHovered && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            onMouseEnter={() => setDeleteHovered(true)}
            onMouseLeave={() => setDeleteHovered(false)}
            style={{
              width: 16, height: 16, borderRadius: 4, border: 'none',
              background: deleteHovered ? 'rgba(239,68,68,0.2)' : 'transparent',
              color: deleteHovered ? 'rgba(239,68,68,0.8)' : 'rgba(255,255,255,0.3)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, flexShrink: 0,
            }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8">
              <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Node items */}
      {open && (
        <div style={{ paddingLeft: 4 }}>
          {nodes.length === 0 ? (
            <div style={{
              padding: '4px 12px 4px 34px',
              fontSize: 11, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic',
            }}>
              No sessions
            </div>
          ) : (
            nodes.map((node) => (
              <NodeItem key={node.id} node={node} workspaceActive={isActive} onSwitchWorkspace={onSwitch} workspaceId={workspace.id} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// NodeItem
// ---------------------------------------------------------------------------

function NodeItem({ node, workspaceActive, onSwitchWorkspace, workspaceId }: {
  node: NodeSummary
  workspaceActive: boolean
  onSwitchWorkspace: () => void
  workspaceId: string
}): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  const { remove, focusedNodeId } = useNodeStore()
  const liveNode = useNodeStore((s) => s.workspaceNodes.get(workspaceId)?.get(node.id) ?? s.nodes.get(node.id))
  const agentStatus = liveNode?.agentStatus
  const { nodeSummaries, setNodeSummaries } = useWorkspaceStore()
  const isFocused = workspaceActive && focusedNodeId === node.id
  const displayTitle = liveNode?.title ?? node.title
  const { isAgentActive, needsUserInput, isDone, isThinking } = getSidebarAgentStatusUi(agentStatus)

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    remove(node.id)
    const current = nodeSummaries[workspaceId] ?? []
    setNodeSummaries(workspaceId, current.filter((n) => n.id !== node.id))
  }

  const handleClick = async () => {
    if (!workspaceActive) {
      onSwitchWorkspace()
      await loadWorkspaceCanvas(workspaceId)
    }
    const liveNode = useNodeStore.getState().nodes.get(node.id)
    if (liveNode) {
      jumpToNode(liveNode)
      if (liveNode.agentStatus === 'done') {
        useNodeStore.getState().setAgentStatus(node.id, 'idle')
      }
    }
  }

  return (
    <div
      className={isAgentActive ? 'agent-active' : needsUserInput ? 'agent-needs-input' : isDone ? 'agent-done' : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        minHeight: 26, padding: (node.subtitle || needsUserInput || isThinking) ? '3px 4px 3px 28px' : '0 4px 0 28px',
        cursor: 'pointer',
        background: hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        borderRadius: 5,
        margin: '0 4px',
        position: 'relative',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
    >
      {isFocused && (
        <div style={{
          position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
          width: 2, height: 12, borderRadius: 2, background: '#a78bfa',
        }} />
      )}
      <NodeTypeIcon type={node.type} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          {needsUserInput && (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
              <path d="M5 1L9 8.5H1L5 1Z" fill="rgba(234,179,8,0.9)" stroke="none"/>
              <path d="M5 4v2" stroke="#0d0d0d" strokeWidth="1.1" strokeLinecap="round"/>
              <circle cx="5" cy="7.2" r="0.5" fill="#0d0d0d"/>
            </svg>
          )}
          <span style={{
            fontSize: 11.5,
            color: needsUserInput ? 'rgba(234,179,8,0.9)' : hovered ? 'rgba(255,255,255,0.65)' : isFocused ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.38)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {displayTitle}
          </span>
        </div>
        {needsUserInput && (
          <span style={{
            fontSize: 10, color: 'rgba(234,179,8,0.6)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            lineHeight: 1.2,
          }}>
            Awaiting user input
          </span>
        )}
        {isThinking && (
          <span style={{
            fontSize: 10, color: 'rgba(167,139,250,0.5)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            lineHeight: 1.2,
          }}>
            thinking…
          </span>
        )}
        {node.subtitle && !needsUserInput && !isThinking && (
          <span style={{
            fontSize: 10, color: 'rgba(255,255,255,0.2)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            lineHeight: 1.2,
          }}>
            {node.subtitle}
          </span>
        )}
      </div>
      {hovered && (
        <div
          onClick={handleDelete}
          style={{
            width: 16, height: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 3,
            color: 'rgba(255,255,255,0.4)',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.color = 'rgba(255,80,80,0.9)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.color = 'rgba(255,255,255,0.4)' }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar(): React.ReactElement {
  const { workspaces, activeId, setActive, removeWorkspace, touchWorkspace, nodeSummaries, setNodeSummaries } =
    useWorkspaceStore()
  const { templates, loaded: templatesLoaded, load: loadTemplates, remove: removeTemplate,
    draggingOverSidebar, draggedTemplate, dragGhostPos,
    startTemplateDrag, updateTemplateDragPos, endTemplateDrag } = useTemplateStore()
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => { if (!templatesLoaded) loadTemplates() }, [templatesLoaded, loadTemplates])

  // Keep active workspace's node summaries in sync with live nodeStore
  useEffect(() => {
    const unsub = useNodeStore.subscribe((state) => {
      const id = useWorkspaceStore.getState().activeId
      if (!id) return
      const summaries = Array.from(state.nodes.values()).map((n) => ({
        id: n.id, title: n.title, type: n.type,
        subtitle: (n.type === 'browser' || n.type === 'browserv2')
          ? (n.props.url as string | undefined)
          : n.type === 'terminal'
            ? (n.props.cwd as string | undefined)
            : undefined,
      }))
      setNodeSummaries(id, summaries)
    })
    return unsub
  }, [setNodeSummaries])

  // Handle template drag-out to canvas
  useEffect(() => {
    if (!draggedTemplate) return
    const onMove = (e: PointerEvent) => updateTemplateDragPos(e.clientX, e.clientY)
    const onUp = (e: PointerEvent) => {
      const canvasRect = document.querySelector('[data-canvas-root]')?.getBoundingClientRect()
      if (canvasRect &&
        e.clientX >= canvasRect.left && e.clientX <= canvasRect.right &&
        e.clientY >= canvasRect.top && e.clientY <= canvasRect.bottom) {
        const camera = useCameraStore.getState().camera
        const wx = (e.clientX - canvasRect.left - camera.x) / camera.zoom
        const wy = (e.clientY - canvasRect.top - camera.y) / camera.zoom
        useNodeStore.getState().add(draggedTemplate.type as any, wx - 300, wy - 150, draggedTemplate.props)
      }
      endTemplateDrag()
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
  }, [draggedTemplate, updateTemplateDragPos, endTemplateDrag])

  const handleSwitch = async (id: string) => {
    if (id === activeId) return
    touchWorkspace(id)
    setActive(id)
    await loadWorkspaceCanvas(id)
    await window.appState.set('lastWorkspaceId', id)
  }

  const handleDelete = async (id: string) => {
    await window.workspace.delete(id)
    removeWorkspace(id)
    setConfirmDeleteId(null)
  }

  return (
    <>
      <div style={{
        width: SIDEBAR_W,
        height: '100%',
        background: draggingOverSidebar ? '#1a1a2e' : '#111111',
        borderRight: draggingOverSidebar
          ? '1px solid rgba(167,139,250,0.4)'
          : '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        transition: 'background 0.15s, border-color 0.15s',
      }}>
        {/* Section label + add button */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '8px 12px 6px 12px',
          flexShrink: 0,
        }}>
          <span style={{
            flex: 1, fontSize: 10.5, fontWeight: 600,
            color: 'rgba(255,255,255,0.25)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            Workspaces
          </span>
          <AddIconButton onClick={() => setShowAdd(true)} />
        </div>

        {/* Workspace list */}
        <div style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          padding: '2px 0 4px 0',
        }}>
          {workspaces.map((ws) => (
            <WorkspaceSection
              key={ws.id}
              workspace={ws}
              isActive={ws.id === activeId}
              nodes={nodeSummaries[ws.id] ?? []}
              onSwitch={() => handleSwitch(ws.id)}
              onDelete={() => setConfirmDeleteId(ws.id)}
            />
          ))}

          {workspaces.length === 0 && (
            <div style={{
              padding: '20px 16px', fontSize: 12,
              color: 'rgba(255,255,255,0.2)', textAlign: 'center', lineHeight: 1.6,
            }}>
              No workspaces yet.{'\n'}Click + to add one.
            </div>
          )}
        </div>

        {/* Sessions */}
        <SessionsSection />

        {/* Library */}
        {(templates.length > 0 || draggingOverSidebar) && (
          <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{
              padding: '7px 12px 5px',
              fontSize: 10.5, fontWeight: 600,
              color: draggingOverSidebar ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.25)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              transition: 'color 0.15s',
            }}>
              {draggingOverSidebar ? 'Drop to save' : 'Library'}
            </div>
            {templates.map(t => (
              <TemplateItem
                key={t.id}
                template={t}
                onDragStart={(e) => startTemplateDrag(t, e.clientX, e.clientY)}
                onRemove={() => removeTemplate(t.id)}
              />
            ))}
          </div>
        )}

        {/* Bottom toolbar */}
        <div style={{
          flexShrink: 0, padding: '6px 8px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <GearButton onClick={() => useViewStore.getState().open(
          { id: 'settings', type: 'settings', label: 'Settings', closeable: true }
        )} />
        </div>
      </div>

      {/* Template drag ghost */}
      {draggedTemplate && (
        <div style={{
          position: 'fixed',
          left: dragGhostPos.x + 12,
          top: dragGhostPos.y + 12,
          zIndex: 999999,
          pointerEvents: 'none',
          background: '#1e1e1e',
          border: '1px solid rgba(167,139,250,0.4)',
          borderRadius: 6,
          padding: '5px 10px',
          display: 'flex', alignItems: 'center', gap: 7,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          fontSize: 12, color: 'rgba(255,255,255,0.75)',
          whiteSpace: 'nowrap',
        }}>
          <NodeTypeIcon type={draggedTemplate.type} />
          {draggedTemplate.title}
        </div>
      )}

      {showAdd && <AddWorkspaceDialog onClose={() => setShowAdd(false)} />}
      {confirmDeleteId && (
        <DeleteConfirm
          workspace={workspaces.find((w) => w.id === confirmDeleteId)!}
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </>
  )
}

function TemplateItem({ template, onDragStart, onRemove }: {
  template: NodeTemplate
  onDragStart: (e: React.PointerEvent) => void
  onRemove: () => void
}): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        height: 28, padding: '0 8px 0 12px',
        cursor: 'grab',
        background: hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        margin: '0 4px', borderRadius: 5,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onPointerDown={onDragStart}
    >
      <NodeTypeIcon type={template.type} />
      <span style={{
        flex: 1, fontSize: 11.5,
        color: hovered ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.38)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {template.title}
      </span>
      {hovered && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          style={{
            width: 14, height: 14, border: 'none', background: 'transparent',
            color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <svg width="8" height="8" viewBox="0 0 8 8">
            <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sessions section
// ---------------------------------------------------------------------------

function SessionItem({ session, onRemove }: {
  session: BrowserSession
  onRemove: () => void
}): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameVal, setNameVal] = useState(session.name)
  const { rename } = useSessionStore()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (renaming && inputRef.current) inputRef.current.select() }, [renaming])

  const commitRename = async () => {
    const trimmed = nameVal.trim()
    if (trimmed && trimmed !== session.name) await rename(session.id, trimmed)
    setRenaming(false)
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        height: 26, padding: '0 8px 0 12px',
        cursor: renaming ? 'default' : 'grab',
        background: hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        borderRadius: 5, margin: '0 4px',
      }}
      draggable={!renaming}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/canvaflow-session', JSON.stringify({ id: session.id }))
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={() => { setRenaming(true); setNameVal(session.name) }}
    >
      {/* Profile icon */}
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="5" cy="3.5" r="2" stroke="rgba(167,139,250,0.7)" strokeWidth="1.1"/>
        <path d="M1.5 9c0-1.93 1.57-3.5 3.5-3.5S8.5 7.07 8.5 9" stroke="rgba(167,139,250,0.7)" strokeWidth="1.1" strokeLinecap="round"/>
      </svg>

      {renaming ? (
        <input
          ref={inputRef}
          value={nameVal}
          onChange={(e) => setNameVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') setRenaming(false)
          }}
          onBlur={commitRename}
          style={{
            flex: 1, height: 18, borderRadius: 3,
            border: '1px solid rgba(167,139,250,0.4)',
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.8)', fontSize: 11,
            padding: '0 5px', outline: 'none', fontFamily: 'inherit',
          }}
        />
      ) : (
        <span style={{
          flex: 1, fontSize: 11.5,
          color: hovered ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.38)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {session.name}
        </span>
      )}

      {hovered && !renaming && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          title="Delete session"
          style={{
            width: 14, height: 14, border: 'none', background: 'transparent',
            color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <svg width="8" height="8" viewBox="0 0 8 8">
            <path d="M1 1l6 6M7 1l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  )
}

function SessionsSection(): React.ReactElement {
  const { sessions, loaded, load, add, remove } = useSessionStore()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!loaded) load() }, [loaded, load])
  useEffect(() => { if (creating && inputRef.current) inputRef.current.focus() }, [creating])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) { setCreating(false); return }
    await add(name)
    setNewName('')
    setCreating(false)
  }

  if (!loaded) return <></>

  return (
    <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '7px 8px 4px 12px',
      }}>
        <span style={{
          flex: 1, fontSize: 10.5, fontWeight: 600,
          color: 'rgba(255,255,255,0.25)',
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          Sessions
        </span>
        <button
          onClick={() => setCreating(true)}
          title="New session"
          style={{
            width: 20, height: 20, borderRadius: 4, border: 'none',
            background: 'transparent', color: 'rgba(255,255,255,0.3)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)' }}
        >
          <PlusIcon />
        </button>
      </div>

      {creating && (
        <div style={{ padding: '2px 8px 6px', display: 'flex', gap: 5 }}>
          <input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setCreating(false); setNewName('') }
            }}
            onBlur={() => { if (!newName.trim()) setCreating(false) }}
            placeholder="Session name…"
            style={{
              flex: 1, height: 24, borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.75)', fontSize: 11,
              padding: '0 7px', outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleCreate}
            style={{
              height: 24, padding: '0 8px', borderRadius: 4,
              border: 'none', background: '#a78bfa', color: '#fff',
              fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Add
          </button>
        </div>
      )}

      {sessions.length === 0 && !creating ? (
        <div style={{
          padding: '2px 12px 8px 28px',
          fontSize: 11, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic',
        }}>
          No saved sessions
        </div>
      ) : (
        <div style={{ paddingBottom: 4 }}>
          {sessions.map((s) => (
            <SessionItem key={s.id} session={s} onRemove={() => remove(s.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function GearButton({ onClick }: { onClick: () => void }): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      title="Settings (⌘,)"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 22, height: 22, borderRadius: 5, border: 'none',
        background: hovered ? 'rgba(255,255,255,0.08)' : 'transparent',
        color: hovered ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.28)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, flexShrink: 0, transition: 'background 0.1s, color 0.1s',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  )
}

function AddIconButton({ onClick }: { onClick: () => void }): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      title="Add workspace"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 20, height: 20, borderRadius: 4, border: 'none',
        background: hovered ? 'rgba(255,255,255,0.08)' : 'transparent',
        color: hovered ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, flexShrink: 0, transition: 'background 0.1s, color 0.1s',
      }}
    >
      <PlusIcon />
    </button>
  )
}
