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
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from './ui/context-menu'
import {
  Terminal,
  Globe,
  Folder,
  FolderOpen,
  NotionLogo,
  Columns,
  Notepad,
  Code,
  Robot,
  Kanban,
  AppWindow,
  Graph,
  TreeStructure,
  Brain,
  User,
  Plus,
  GearSix,
  X,
  CaretRight,
  Eye,
  EyeSlash,
  Archive,
  ArrowCounterClockwise,
} from '@phosphor-icons/react'

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
// Icons (Phosphor – filled, flat colors)
// ---------------------------------------------------------------------------

const ICON_SIZE = 14

const nodeIconMap: Record<string, { icon: React.ElementType; color: string }> = {
  terminal:     { icon: Terminal,      color: '#6dba9a' },  // green
  browser:      { icon: Globe,         color: '#7aa3d4' },  // blue
  browserv2:    { icon: Globe,         color: '#7aa3d4' },
  files:        { icon: Folder,        color: '#c4a24e' },  // golden
  notion:       { icon: NotionLogo,    color: '#a0a0a0' },  // grey
  trello:       { icon: Columns,       color: '#5b9ec9' },  // cerulean
  note:         { icon: Notepad,       color: '#b07ec4' },  // purple
  monaco:       { icon: Code,          color: '#d4a056' },  // amber
  claude:       { icon: Brain,         color: '#c47a8a' },  // rose
  codex:        { icon: Robot,         color: '#5ec3b3' },  // aqua
  orchestrator: { icon: Graph,         color: '#d08c5a' },  // burnt orange
  subagent:     { icon: TreeStructure, color: '#8a7ec4' },  // indigo
  kanban:       { icon: Kanban,        color: '#5aafa0' },  // teal
  windowpicker: { icon: AppWindow,     color: '#8a95a3' },  // slate
}

function NodeTypeIcon({ type }: { type: string }): React.ReactElement {
  const entry = nodeIconMap[type]
  if (entry) {
    const Icon = entry.icon
    return <Icon size={ICON_SIZE} weight="fill" color={entry.color} style={{ flexShrink: 0 }} />
  }
  return <Robot size={ICON_SIZE} weight="fill" color="rgba(255,255,255,0.35)" style={{ flexShrink: 0 }} />
}

function ChevronIcon({ open }: { open: boolean }): React.ReactElement {
  return (
    <CaretRight
      size={12}
      weight="bold"
      color="currentColor"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
    />
  )
}

// ---------------------------------------------------------------------------
// Workspace icon — shows .ico from project root if available, else folder
// ---------------------------------------------------------------------------

const workspaceIconCache = new Map<string, string | null>()

const FAVICON_CANDIDATES = [
  'public/favicon.ico',
  'public/favicon.png',
  'public/favicon.svg',
  'static/favicon.ico',
  'static/favicon.png',
  'favicon.ico',
  'favicon.png',
  'favicon.svg',
  'assets/favicon.ico',
  'assets/favicon.png',
  'src/assets/favicon.ico',
  'src/assets/favicon.png',
  'resources/icon.ico',
  'resources/icon.png',
  'build/icon.ico',
  'build/icon.png',
]

const MIME_BY_EXT: Record<string, string> = {
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

async function findFavicon(basePath: string): Promise<string | null> {
  const base = basePath.replace(/\/$/, '')
  for (const candidate of FAVICON_CANDIDATES) {
    const fullPath = `${base}/${candidate}`
    const exists = await window.fs.fileExists(fullPath)
    if (!exists) continue
    const b64 = await window.fs.readFileBase64(fullPath)
    if (b64) {
      const ext = candidate.slice(candidate.lastIndexOf('.')).toLowerCase()
      const mime = MIME_BY_EXT[ext] || 'image/x-icon'
      return `data:${mime};base64,${b64}`
    }
  }
  return null
}

function WorkspaceIcon({ path, open }: { path: string; open: boolean }): React.ReactElement {
  const [iconUrl, setIconUrl] = useState<string | null>(workspaceIconCache.get(path) ?? null)
  const [checked, setChecked] = useState(workspaceIconCache.has(path))

  useEffect(() => {
    if (checked) return
    let cancelled = false
    findFavicon(path).then((url) => {
      if (!cancelled) {
        workspaceIconCache.set(path, url)
        setIconUrl(url)
        setChecked(true)
      }
    }).catch(() => {
      workspaceIconCache.set(path, null)
      if (!cancelled) setChecked(true)
    })
    return () => { cancelled = true }
  }, [path, checked])

  if (iconUrl) {
    return <img src={iconUrl} width={14} height={14} style={{ borderRadius: 2, flexShrink: 0 }} />
  }

  const Icon = open ? FolderOpen : Folder
  return <Icon size={14} weight="fill" color="rgba(255,255,255,0.3)" style={{ flexShrink: 0 }} />
}

// ---------------------------------------------------------------------------
// Add Workspace Dialog
// ---------------------------------------------------------------------------

export function AddWorkspaceDialog({ onClose, initialPath = '' }: { onClose: () => void; initialPath?: string }): React.ReactElement {
  const [name, setName] = useState(initialPath ? (initialPath.split('/').pop() || initialPath) : '')
  const [path, setPath] = useState(initialPath)
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
      archived: false,
      sortOrder: 0,
    }
    await window.workspace.save({ ...ws, archived: 0, sortOrder: 0 })
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
  onArchive: () => void
  onRename: (name: string) => void
  privacyMode: boolean
  isDragging?: boolean
  isDragOver?: boolean
  dragOverPos?: 'before' | 'after'
  onDragStart?: () => void
  onDragOver?: (e: React.DragEvent, pos: 'before' | 'after') => void
  onDragLeave?: () => void
  onDrop?: () => void
  onDragEnd?: () => void
}

function WorkspaceSection({ workspace, isActive, nodes, onSwitch, onDelete, onArchive, onRename, privacyMode,
  isDragging, isDragOver, dragOverPos, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd }: SectionProps): React.ReactElement {
  const [open, setOpen] = useState(isActive)
  const [headerHovered, setHeaderHovered] = useState(false)
  const [deleteHovered, setDeleteHovered] = useState(false)
  const [archiveHovered, setArchiveHovered] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [nameVal, setNameVal] = useState(workspace.name)
  const renameRef = useRef<HTMLInputElement>(null)

  // Auto-expand when becoming active
  useEffect(() => { if (isActive) setOpen(true) }, [isActive])
  useEffect(() => { if (renaming && renameRef.current) renameRef.current.select() }, [renaming])

  const startRename = () => { setNameVal(workspace.name); setRenaming(true) }
  const commitRename = () => {
    const trimmed = nameVal.trim()
    if (trimmed && trimmed !== workspace.name) onRename(trimmed)
    setRenaming(false)
  }

  return (
    <div
      style={{ width: '100%', position: 'relative', opacity: isDragging ? 0.4 : 1 }}
      onDragEnd={onDragEnd}
    >
      {/* Drop indicator — before */}
      {isDragOver && dragOverPos === 'before' && (
        <div style={{ position: 'absolute', top: 0, left: 8, right: 8, height: 2, background: '#a78bfa', borderRadius: 1, zIndex: 10, pointerEvents: 'none' }} />
      )}
      {/* Workspace header row */}
      <ContextMenu>
      <ContextMenuTrigger>
      <div
        draggable={!renaming}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          height: 30, padding: '0 10px 0 8px',
          cursor: 'grab',
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
        onClick={() => { if (renaming) return; setOpen((o) => !o); if (!isActive) onSwitch() }}
        onDoubleClick={(e) => { e.stopPropagation(); startRename() }}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.() }}
        onDragOver={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          const pos: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
          onDragOver?.(e, pos)
        }}
        onDragLeave={onDragLeave}
        onDrop={(e) => { e.preventDefault(); onDrop?.() }}
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

        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <WorkspaceIcon path={workspace.path} open={open} />
        </span>

        {renaming ? (
          <input
            ref={renameRef}
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setRenaming(false)
            }}
            onBlur={commitRename}
            style={{
              flex: 1, height: 19, borderRadius: 3,
              border: '1px solid rgba(167,139,250,0.4)',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.85)', fontSize: 12,
              padding: '0 5px', outline: 'none', fontFamily: 'inherit',
            }}
          />
        ) : (
          <span style={{
            flex: 1, fontSize: 12, fontWeight: isActive ? 500 : 400,
            color: isActive ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.5)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            letterSpacing: '0.01em',
          }}>
            {privacyMode && !isActive ? (
              <>
                {workspace.name.slice(0, 3)}
                <span style={{ filter: 'blur(4px)', userSelect: 'none' }}>
                  {workspace.name.slice(3)}
                </span>
              </>
            ) : workspace.name}
          </span>
        )}

        {/* Archive + Delete buttons — only on hover */}
        {headerHovered && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onArchive() }}
              onMouseEnter={() => setArchiveHovered(true)}
              onMouseLeave={() => setArchiveHovered(false)}
              title={workspace.archived ? 'Unarchive' : 'Archive'}
              style={{
                width: 16, height: 16, borderRadius: 4, border: 'none',
                background: archiveHovered ? 'rgba(167,139,250,0.15)' : 'transparent',
                color: archiveHovered ? 'rgba(167,139,250,0.8)' : 'rgba(255,255,255,0.3)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 0, flexShrink: 0,
              }}
            >
              {workspace.archived
                ? <ArrowCounterClockwise size={10} weight="bold" />
                : <Archive size={10} weight="bold" />}
            </button>
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
              <X size={10} weight="bold" />
            </button>
          </>
        )}
      </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={startRename}>Rename</ContextMenuItem>
        <ContextMenuItem onClick={onArchive}>{workspace.archived ? 'Unarchive' : 'Archive'}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem destructive onClick={onDelete}>Delete</ContextMenuItem>
      </ContextMenuContent>
      </ContextMenu>

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
      {/* Drop indicator — after */}
      {isDragOver && dragOverPos === 'after' && (
        <div style={{ position: 'absolute', bottom: 0, left: 8, right: 8, height: 2, background: '#a78bfa', borderRadius: 1, zIndex: 10, pointerEvents: 'none' }} />
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
          <X size={12} weight="bold" />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar(): React.ReactElement {
  const { workspaces, activeId, setActive, removeWorkspace, touchWorkspace, archiveWorkspace, renameWorkspace, reorderWorkspaces, nodeSummaries, setNodeSummaries } =
    useWorkspaceStore()
  const { templates, loaded: templatesLoaded, load: loadTemplates, remove: removeTemplate,
    draggingOverSidebar, draggedTemplate, dragGhostPos,
    startTemplateDrag, updateTemplateDragPos, endTemplateDrag } = useTemplateStore()
  const [showAdd, setShowAdd] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [libraryCollapsed, setLibraryCollapsed] = useState(true)
  const [archivedCollapsed, setArchivedCollapsed] = useState(true)
  const [privacyMode, setPrivacyMode] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragOverPos, setDragOverPos] = useState<'before' | 'after'>('before')

  const sortWs = (list: Workspace[]) =>
    [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  const activeWorkspaces = sortWs(workspaces.filter((w) => !w.archived))
  const archivedWorkspaces = sortWs(workspaces.filter((w) => w.archived))

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

  const handleArchive = async (id: string, archived: boolean) => {
    archiveWorkspace(id, archived)
    const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === id)
    if (ws) await window.workspace.save({ ...ws, archived: archived ? 1 : 0, description: ws.description ?? null, color: ws.color ?? null, sortOrder: ws.sortOrder ?? 0 })
  }

  const handleRename = async (id: string, name: string) => {
    renameWorkspace(id, name)
    const ws = useWorkspaceStore.getState().workspaces.find((w) => w.id === id)
    if (ws) await window.workspace.save({ ...ws, name, archived: ws.archived ? 1 : 0, description: ws.description ?? null, color: ws.color ?? null, sortOrder: ws.sortOrder ?? 0 })
  }

  const handleReorder = async (list: Workspace[], fromId: string, toId: string, pos: 'before' | 'after') => {
    const fromIdx = list.findIndex((w) => w.id === fromId)
    const toIdx = list.findIndex((w) => w.id === toId)
    if (fromIdx < 0 || toIdx < 0 || fromId === toId) return
    const next = [...list]
    const [item] = next.splice(fromIdx, 1)
    const insertAt = next.findIndex((w) => w.id === toId)
    next.splice(pos === 'before' ? insertAt : insertAt + 1, 0, item)
    const orderedIds = next.map((w) => w.id)
    reorderWorkspaces(orderedIds)
    // persist
    const updated = useWorkspaceStore.getState().workspaces
    await Promise.all(
      orderedIds.map((id, idx) => {
        const ws = updated.find((w) => w.id === id)
        if (!ws) return Promise.resolve()
        return window.workspace.save({ ...ws, sortOrder: idx, archived: ws.archived ? 1 : 0, description: ws.description ?? null, color: ws.color ?? null })
      })
    )
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
          <PrivacyButton active={privacyMode} onClick={() => setPrivacyMode((v) => !v)} />
          <AddIconButton onClick={() => setShowAdd(true)} />
        </div>

        {/* Workspace list */}
        <div style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          padding: '2px 0 4px 0',
        }}>
          {activeWorkspaces.map((ws) => (
            <WorkspaceSection
              key={ws.id}
              workspace={ws}
              isActive={ws.id === activeId}
              nodes={nodeSummaries[ws.id] ?? []}
              onSwitch={() => handleSwitch(ws.id)}
              onDelete={() => setConfirmDeleteId(ws.id)}
              onArchive={() => handleArchive(ws.id, true)}
              onRename={(name) => handleRename(ws.id, name)}
              privacyMode={privacyMode}
              isDragging={draggedId === ws.id}
              isDragOver={dragOverId === ws.id}
              dragOverPos={dragOverPos}
              onDragStart={() => setDraggedId(ws.id)}
              onDragOver={(e, pos) => { e.preventDefault(); setDragOverId(ws.id); setDragOverPos(pos) }}
              onDragLeave={() => setDragOverId(null)}
              onDrop={() => {
                if (draggedId) handleReorder(activeWorkspaces, draggedId, ws.id, dragOverPos)
                setDraggedId(null); setDragOverId(null)
              }}
              onDragEnd={() => { setDraggedId(null); setDragOverId(null) }}
            />
          ))}

          {activeWorkspaces.length === 0 && archivedWorkspaces.length === 0 && (
            <div style={{
              padding: '20px 16px', fontSize: 12,
              color: 'rgba(255,255,255,0.2)', textAlign: 'center', lineHeight: 1.6,
            }}>
              No workspaces yet.{'\n'}Click + to add one.
            </div>
          )}

          {archivedWorkspaces.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div
                onClick={() => setArchivedCollapsed((v) => !v)}
                style={{
                  padding: '5px 12px 4px',
                  fontSize: 10.5, fontWeight: 600,
                  color: 'rgba(255,255,255,0.2)',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  userSelect: 'none',
                }}
              >
                <ChevronIcon open={!archivedCollapsed} />
                Archived
              </div>
              {!archivedCollapsed && archivedWorkspaces.map((ws) => (
                <WorkspaceSection
                  key={ws.id}
                  workspace={ws}
                  isActive={ws.id === activeId}
                  nodes={nodeSummaries[ws.id] ?? []}
                  onSwitch={() => handleSwitch(ws.id)}
                  onDelete={() => setConfirmDeleteId(ws.id)}
                  onArchive={() => handleArchive(ws.id, false)}
                  onRename={(name) => handleRename(ws.id, name)}
                  privacyMode={privacyMode}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sessions */}
        <SessionsSection />

        {/* Library */}
        {(templates.length > 0 || draggingOverSidebar) && (
          <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div
              onClick={() => !draggingOverSidebar && setLibraryCollapsed(!libraryCollapsed)}
              style={{
                padding: '7px 12px 5px',
                fontSize: 10.5, fontWeight: 600,
                color: draggingOverSidebar ? 'rgba(167,139,250,0.7)' : 'rgba(255,255,255,0.25)',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                transition: 'color 0.15s',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                userSelect: 'none',
              }}
            >
              <ChevronIcon open={!libraryCollapsed} />
              {draggingOverSidebar ? 'Drop to save' : 'Library'}
            </div>
            {!libraryCollapsed && templates.map(t => (
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
      <User size={13} weight="fill" color="#9a84c4" style={{ flexShrink: 0 }} />

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
  const [collapsed, setCollapsed] = useState(true)
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
        <span
          onClick={() => setCollapsed(!collapsed)}
          style={{
            flex: 1, fontSize: 10.5, fontWeight: 600,
            color: 'rgba(255,255,255,0.25)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            userSelect: 'none',
          }}
        >
          <ChevronIcon open={!collapsed} />
          Sessions
        </span>
        <button
          onClick={() => { setCollapsed(false); setCreating(true) }}
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
          <Plus size={13} weight="bold" />
        </button>
      </div>

      {!collapsed && (
        <>
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
        </>
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
      <GearSix size={15} weight="fill" />
    </button>
  )
}

function PrivacyButton({ active, onClick }: { active: boolean; onClick: () => void }): React.ReactElement {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      title={active ? 'Show workspace names' : 'Hide workspace names'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 20, height: 20, borderRadius: 4, border: 'none',
        background: active ? 'rgba(167,139,250,0.15)' : hovered ? 'rgba(255,255,255,0.08)' : 'transparent',
        color: active ? 'rgba(167,139,250,0.8)' : hovered ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, flexShrink: 0, transition: 'background 0.1s, color 0.1s',
        marginRight: 2,
      }}
    >
      {active ? <EyeSlash size={12} weight="bold" /> : <Eye size={12} weight="bold" />}
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
      <Plus size={13} weight="bold" />
    </button>
  )
}
