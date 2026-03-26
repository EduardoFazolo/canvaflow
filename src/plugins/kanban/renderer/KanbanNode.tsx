import React, { useState, useCallback, useRef, useEffect } from 'react'
import { nanoid } from 'nanoid'
import { BaseNode } from '../../../renderer/src/components/BaseNode'
import { ColorPicker } from '../../../renderer/src/components/ui/color-picker'
import { useNodeStore, type NodeData } from '../../../renderer/src/stores/nodeStore'
import { useViewStore } from '../../../renderer/src/stores/viewStore'
import { useActivationStore } from '../../../renderer/src/stores/activationStore'
import { getActiveWorkspace } from '../../../renderer/src/stores/workspaceStore'
import { useKanbanStore, createDefaultBoard, type KanbanCard, type KanbanColumn, type KanbanBoard, type KanbanState } from '../store'
import { KanbanDropModal, type KanbanDropPayload } from './KanbanDropModal'
import { WorktreeStartModal, type WorktreeConfig } from './WorktreeStartModal'

// ---------------------------------------------------------------------------
// Drag state (module-level to avoid re-renders during drag)
// ---------------------------------------------------------------------------

let dragCardId: string | null = null
let dragSourceColId: string | null = null
let droppedInternally = false

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const BADGE_COLORS: Record<string, string> = {
  idle: 'rgba(255,255,255,0.2)',
  thinking: '#f59e0b',
  executing: '#3b82f6',
  modifying_files: '#3b82f6',
  done: '#22c55e',
  error: '#ef4444',
  needs_permission: '#f59e0b',
  needs_input: '#f59e0b',
}

function CardItem({
  card,
  columnId,
  onDelete,
  onUpdate,
  onExternalDrop,
}: {
  card: KanbanCard
  columnId: string
  onDelete: (colId: string, cardId: string) => void
  onUpdate: (colId: string, cardId: string, patch: Partial<KanbanCard>) => void
  onExternalDrop: (card: KanbanCard, clientX: number, clientY: number) => void
}): React.ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(card.title)
  const [descDraft, setDescDraft] = useState(card.description ?? '')
  const [hovered, setHovered] = useState(false)

  // Check if this card has an active worktree view
  const worktreeView = useViewStore((s) => s.instances.find((i) => i.sourceCardId === card.id))

  const commit = useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed) {
      onUpdate(columnId, card.id, { title: trimmed, description: descDraft.trim() || undefined })
    }
    setEditing(false)
  }, [draft, descDraft, columnId, card.id, onUpdate])

  return (
    <div
      draggable={!editing}
      onDragStart={(e) => {
        dragCardId = card.id
        dragSourceColId = columnId
        droppedInternally = false
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('application/canvaflow-kanban-card', '')
        const el = e.currentTarget as HTMLElement
        el.style.opacity = '0.4'
      }}
      onDragEnd={(e) => {
        (e.currentTarget as HTMLElement).style.opacity = '1'
        if (!droppedInternally && e.clientX > 0 && e.clientY > 0) {
          onExternalDrop(card, e.clientX, e.clientY)
        }
        dragCardId = null
        dragSourceColId = null
        droppedInternally = false
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        if (!editing && worktreeView) {
          useViewStore.getState().activate(worktreeView.id)
        }
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        setDraft(card.title)
        setDescDraft(card.description ?? '')
        setEditing(true)
      }}
      style={{
        background: '#1a1a1a',
        border: worktreeView ? '1px solid rgba(34,211,238,0.15)' : '1px solid rgba(255,255,255,0.07)',
        borderRadius: 6,
        padding: '8px 10px',
        cursor: editing ? 'text' : (worktreeView ? 'pointer' : 'grab'),
        transition: 'border-color 0.12s, background 0.12s',
        position: 'relative',
        ...(hovered && !editing ? { borderColor: worktreeView ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.15)', background: '#1e1e1e' } : {}),
      }}
    >
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(false)
              e.stopPropagation()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4,
              color: '#e0e0e0',
              fontSize: 12,
              fontWeight: 600,
              padding: '4px 6px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <textarea
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false)
              e.stopPropagation()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="Description (optional)"
            rows={2}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 4,
              color: '#999',
              fontSize: 11,
              padding: '4px 6px',
              outline: 'none',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            <button
              onClick={commit}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 4,
                background: 'rgba(255,255,255,0.08)', border: 'none',
                color: '#aaa', cursor: 'pointer',
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <svg width="6" height="14" viewBox="0 0 6 14" style={{ opacity: hovered ? 0.3 : 0.12, flexShrink: 0, marginTop: 1, transition: 'opacity 0.15s' }}>
              <circle cx="1.5" cy="2" r="1" fill="white" />
              <circle cx="4.5" cy="2" r="1" fill="white" />
              <circle cx="1.5" cy="7" r="1" fill="white" />
              <circle cx="4.5" cy="7" r="1" fill="white" />
              <circle cx="1.5" cy="12" r="1" fill="white" />
              <circle cx="4.5" cy="12" r="1" fill="white" />
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e0', lineHeight: 1.3 }}>
                {card.title}
              </div>
              {card.description && (
                <div style={{ fontSize: 11, color: '#777', marginTop: 3, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {card.description}
                </div>
              )}
            </div>
          </div>

          {/* Worktree agent status badge */}
          {worktreeView && worktreeView.agentStatus && (
            <div
              title={`Agent: ${worktreeView.agentStatus}`}
              style={{
                position: 'absolute', top: 6, right: worktreeView.agentStatus === 'done' ? 6 : 6,
                width: 8, height: 8, borderRadius: '50%',
                background: BADGE_COLORS[worktreeView.agentStatus] || 'rgba(255,255,255,0.2)',
                animation: (worktreeView.agentStatus === 'thinking' || worktreeView.agentStatus === 'executing' || worktreeView.agentStatus === 'modifying_files')
                  ? 'worktree-pulse 1.5s ease-in-out infinite' : undefined,
              }}
            />
          )}

          {hovered && !worktreeView && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(columnId, card.id) }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: 'absolute', top: 4, right: 4,
                width: 18, height: 18, borderRadius: 4,
                background: 'rgba(255,255,255,0.06)',
                border: 'none', color: 'rgba(255,255,255,0.3)',
                cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 12, lineHeight: 1,
              }}
              title="Delete card"
            >
              &times;
            </button>
          )}
        </>
      )}
    </div>
  )
}

function ColumnHeader({
  column,
  cardCount,
  onRename,
  onColorChange,
  onDelete,
}: {
  column: KanbanColumn
  cardCount: number
  onRename: (id: string, name: string) => void
  onColorChange: (id: string, color: string) => void
  onDelete: (id: string) => void
}): React.ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(column.title)
  const [hovered, setHovered] = useState(false)

  const commit = useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed) onRename(column.id, trimmed)
    setEditing(false)
  }, [draft, column.id, onRename])

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px 8px',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: column.color, flexShrink: 0 }} />

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') commit()
            e.stopPropagation()
          }}
          onBlur={commit}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 3,
            color: '#ccc',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            padding: '2px 5px',
            outline: 'none',
            fontFamily: 'inherit',
            textTransform: 'uppercase',
          }}
        />
      ) : (
        <span
          onDoubleClick={(e) => { e.stopPropagation(); setDraft(column.title); setEditing(true) }}
          style={{
            fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)',
            letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'default',
          }}
        >
          {column.title}
        </span>
      )}

      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 600, marginLeft: -2 }}>
        {cardCount}
      </span>

      <div style={{ flex: 1 }} />

      {hovered && (
        <ColorPicker
          color={column.color}
          onChange={(c) => onColorChange(column.id, c)}
          swatchSize={14}
        />
      )}

      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(column.id) }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Delete column"
          style={{
            width: 18, height: 18, borderRadius: 4,
            background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,0.2)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, lineHeight: 1,
          }}
        >
          &times;
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main KanbanNode
// ---------------------------------------------------------------------------

export function KanbanNode({ node }: { node: NodeData }): React.ReactElement {
  const workspaceId = useNodeStore((s) => s.activeWorkspaceId)
  const { state, setState: setKanbanState, load, loaded } = useKanbanStore()
  const [pendingDrop, setPendingDrop] = useState<KanbanDropPayload | null>(null)
  const [worktreeDrop, setWorktreeDrop] = useState<{
    card: KanbanCard
    sourceColId: string
    targetColId: string
  } | null>(null)

  // Load kanban data for this workspace on mount
  useEffect(() => {
    if (workspaceId) load(workspaceId)
  }, [workspaceId, load])

  const persist = useCallback(
    (next: KanbanState) => {
      setKanbanState(next)
    },
    [setKanbanState],
  )

  const activeBoard = state.boards.find((b) => b.id === state.activeBoardId) ?? state.boards[0]

  // ----- Board operations -----

  const addBoard = useCallback(() => {
    const board = createDefaultBoard()
    board.name = `Board ${state.boards.length + 1}`
    persist({ boards: [...state.boards, board], activeBoardId: board.id })
  }, [state, persist])

  const removeBoard = useCallback((boardId: string) => {
    if (state.boards.length <= 1) return
    const remaining = state.boards.filter((b) => b.id !== boardId)
    persist({
      boards: remaining,
      activeBoardId: state.activeBoardId === boardId ? remaining[0].id : state.activeBoardId,
    })
  }, [state, persist])

  const renameBoard = useCallback((boardId: string, name: string) => {
    persist({
      ...state,
      boards: state.boards.map((b) => (b.id === boardId ? { ...b, name } : b)),
    })
  }, [state, persist])

  // ----- Column operations -----

  const updateBoard = useCallback(
    (columns: KanbanColumn[]) => {
      persist({
        ...state,
        boards: state.boards.map((b) => (b.id === activeBoard.id ? { ...b, columns } : b)),
      })
    },
    [state, activeBoard, persist],
  )

  const addColumn = useCallback(() => {
    const colors = ['#868e96', '#1c7ed6', '#f08c00', '#2f9e44', '#7048e8', '#e03131', '#1098ad']
    updateBoard([
      ...activeBoard.columns,
      {
        id: nanoid(8),
        title: 'NEW COLUMN',
        color: colors[activeBoard.columns.length % colors.length],
        cards: [],
      },
    ])
  }, [activeBoard, updateBoard])

  const removeColumn = useCallback((colId: string) => {
    updateBoard(activeBoard.columns.filter((c) => c.id !== colId))
  }, [activeBoard, updateBoard])

  const renameColumn = useCallback((colId: string, title: string) => {
    updateBoard(activeBoard.columns.map((c) => (c.id === colId ? { ...c, title } : c)))
  }, [activeBoard, updateBoard])

  const changeColumnColor = useCallback((colId: string, color: string) => {
    updateBoard(activeBoard.columns.map((c) => (c.id === colId ? { ...c, color } : c)))
  }, [activeBoard, updateBoard])

  // ----- Card operations -----

  const addCard = useCallback((colId: string, title: string) => {
    updateBoard(
      activeBoard.columns.map((c) =>
        c.id === colId
          ? { ...c, cards: [...c.cards, { id: nanoid(8), title }] }
          : c,
      ),
    )
  }, [activeBoard, updateBoard])

  const deleteCard = useCallback((colId: string, cardId: string) => {
    updateBoard(
      activeBoard.columns.map((c) =>
        c.id === colId ? { ...c, cards: c.cards.filter((card) => card.id !== cardId) } : c,
      ),
    )
  }, [activeBoard, updateBoard])

  const updateCard = useCallback((colId: string, cardId: string, patch: Partial<KanbanCard>) => {
    updateBoard(
      activeBoard.columns.map((c) =>
        c.id === colId
          ? { ...c, cards: c.cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card)) }
          : c,
      ),
    )
  }, [activeBoard, updateBoard])

  // ----- External drop (card dragged onto canvas) -----

  const onExternalDrop = useCallback((card: KanbanCard, clientX: number, clientY: number) => {
    setPendingDrop({ title: card.title, subtitle: card.description, clientX, clientY })
  }, [])

  // ----- Drag & drop between columns -----

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const moveCard = useCallback(
    (srcColId: string, targetColId: string, cardId: string, insertIndex?: number) => {
      const srcCol = activeBoard.columns.find((c) => c.id === srcColId)
      if (!srcCol) return
      const card = srcCol.cards.find((c) => c.id === cardId)
      if (!card) return

      const newColumns = activeBoard.columns.map((col) => {
        if (col.id === srcColId && col.id === targetColId) {
          const without = col.cards.filter((c) => c.id !== cardId)
          const idx = insertIndex ?? without.length
          without.splice(idx, 0, card)
          return { ...col, cards: without }
        }
        if (col.id === srcColId) {
          return { ...col, cards: col.cards.filter((c) => c.id !== cardId) }
        }
        if (col.id === targetColId) {
          const idx = insertIndex ?? col.cards.length
          const newCards = [...col.cards]
          newCards.splice(idx, 0, card)
          return { ...col, cards: newCards }
        }
        return col
      })

      updateBoard(newColumns)
    },
    [activeBoard, updateBoard],
  )

  const onDropOnColumn = useCallback(
    (targetColId: string, insertIndex?: number) => {
      if (!dragCardId || !dragSourceColId) return
      if (dragSourceColId === targetColId && insertIndex === undefined) return

      const cardId = dragCardId
      const srcColId = dragSourceColId

      // Intercept drops to "IN PROGRESS" — show worktree modal instead
      const targetCol = activeBoard.columns.find((c) => c.id === targetColId)
      if (targetCol && targetCol.title.toUpperCase() === 'IN PROGRESS' && srcColId !== targetColId) {
        const srcCol = activeBoard.columns.find((c) => c.id === srcColId)
        const card = srcCol?.cards.find((c) => c.id === cardId)
        if (card) {
          // Check if there's already a worktree view for this card
          const existingView = useViewStore.getState().getViewByCardId(card.id)
          if (existingView) {
            // Just switch to it and move the card normally
            useViewStore.getState().activate(existingView.id)
            moveCard(srcColId, targetColId, cardId, insertIndex)
          } else {
            setWorktreeDrop({ card, sourceColId: srcColId, targetColId })
          }
          dragCardId = null
          dragSourceColId = null
          return
        }
      }

      moveCard(srcColId, targetColId, cardId, insertIndex)
      dragCardId = null
      dragSourceColId = null
    },
    [activeBoard, updateBoard, moveCard],
  )

  if (!loaded) {
    return (
      <BaseNode node={node}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
          Loading...
        </div>
      </BaseNode>
    )
  }

  return (
    <BaseNode node={node}>
      {pendingDrop && (
        <KanbanDropModal payload={pendingDrop} onClose={() => setPendingDrop(null)} />
      )}
      {worktreeDrop && (
        <WorktreeStartModal
          card={worktreeDrop.card}
          onConfirm={async (config: WorktreeConfig) => {
            const workspace = getActiveWorkspace()
            const cwd = workspace?.path
            if (!cwd) throw new Error('No active workspace')

            // 1. Create the worktree
            const baseBranch = config.branchFromMain ? 'main' : undefined
            const worktreePath = await window.git.worktreeAdd(cwd, config.branchName, baseBranch)

            // 2. Create the canvas view tab
            const viewId = useViewStore.getState().createWorktreeView({
              worktreePath,
              branchName: config.branchName,
              sourceCardId: worktreeDrop.card.id,
            })

            // 3. Move card to "In Progress"
            moveCard(worktreeDrop.sourceColId, worktreeDrop.targetColId, worktreeDrop.card.id)

            // 4. Close modal
            setWorktreeDrop(null)

            // 5. Spawn the agent in the new canvas (after a tick for view to mount)
            setTimeout(async () => {
              const nodeStore = useNodeStore.getState()
              const prompt = worktreeDrop.card.description
                ? `${worktreeDrop.card.title}\n\n${worktreeDrop.card.description}`
                : worktreeDrop.card.title

              if (config.agentId === 'claude') {
                // Create the node first (this does NOT start the PTY —
                // that only happens when the activation gate opens)
                const newNode = nodeStore.add('claude', 100, 100, {
                  cwd: worktreePath,
                  claudeFlags: '--dangerously-skip-permissions',
                })

                // Register with the main-process coordinator BEFORE
                // activating. The coordinator hooks into pty.onData so
                // it will see every byte from the very first instant.
                await window.coordinator.register(newNode.id, prompt)

                // NOW open the activation gate — PTY starts, coordinator
                // is already listening. Zero race condition.
                useActivationStore.getState().activateNow(newNode.id)
                useViewStore.getState().updateAgentStatus(viewId, 'idle', newNode.id)
              } else if (config.agentId === 'orchestrate') {
                const newNode = nodeStore.add('orchestrator', 100, 100, {
                  task: worktreeDrop.card.title,
                  status: 'idle',
                  subagentIds: [],
                })
                useActivationStore.getState().activateNow(newNode.id)
                useViewStore.getState().updateAgentStatus(viewId, 'idle', newNode.id)
                window.orchestrator.start(newNode.id, {
                  task: worktreeDrop.card.title,
                  markdown: prompt,
                  worldX: 100,
                  worldY: 100,
                  workspacePath: worktreePath,
                })
              }
            }, 100)
          }}
          onClose={() => setWorktreeDrop(null)}
        />
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          background: '#0d0d0d',
        }}
      >
        {/* Board tabs bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: '6px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            flexShrink: 0,
          }}
        >
          {state.boards.map((board) => (
            <BoardTab
              key={board.id}
              board={board}
              active={board.id === state.activeBoardId}
              onSelect={() => persist({ ...state, activeBoardId: board.id })}
              onRename={(name) => renameBoard(board.id, name)}
              onDelete={state.boards.length > 1 ? () => removeBoard(board.id) : undefined}
            />
          ))}
          <button
            onClick={(e) => { e.stopPropagation(); addBoard() }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              width: 22, height: 22, borderRadius: 4,
              background: 'transparent', border: '1px dashed rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.2)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, lineHeight: 1, marginLeft: 4,
            }}
            title="Add board"
          >
            +
          </button>
        </div>

        {/* Columns container */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            gap: 8,
            padding: '8px 10px',
            overflowX: 'auto',
            overflowY: 'hidden',
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {activeBoard.columns.map((col) => (
            <Column
              key={col.id}
              column={col}
              onDragOver={onDragOver}
              onDrop={onDropOnColumn}
              onAddCard={addCard}
              onDeleteCard={deleteCard}
              onUpdateCard={updateCard}
              onExternalDrop={onExternalDrop}
              onRename={renameColumn}
              onColorChange={changeColumnColor}
              onDelete={removeColumn}
            />
          ))}

          <button
            onClick={(e) => { e.stopPropagation(); addColumn() }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              minWidth: 180,
              height: 40,
              borderRadius: 8,
              background: 'transparent',
              border: '1px dashed rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.2)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 500,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)'
              ;(e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'
              ;(e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.2)'
            }}
            title="Add column"
          >
            + Add column
          </button>
        </div>
      </div>
    </BaseNode>
  )
}

// ---------------------------------------------------------------------------
// Board tab
// ---------------------------------------------------------------------------

function BoardTab({
  board,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  board: KanbanBoard
  active: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onDelete?: () => void
}): React.ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(board.name)

  const commit = useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed) onRename(trimmed)
    setEditing(false)
  }, [draft, onRename])

  return (
    <div
      onClick={() => !editing && onSelect()}
      onDoubleClick={(e) => { e.stopPropagation(); setDraft(board.name); setEditing(true) }}
      style={{
        padding: '3px 10px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: active ? 600 : 400,
        color: active ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)',
        background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        transition: 'background 0.12s, color 0.12s',
        position: 'relative',
      }}
    >
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') commit()
            e.stopPropagation()
          }}
          onBlur={commit}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'transparent', border: 'none', outline: 'none',
            color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 600,
            fontFamily: 'inherit', width: 70, padding: 0,
          }}
        />
      ) : (
        <span>{board.name}</span>
      )}
      {onDelete && active && !editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            width: 14, height: 14, borderRadius: 3,
            background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,0.2)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, lineHeight: 1,
          }}
        >
          &times;
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

function Column({
  column,
  onDragOver,
  onDrop,
  onAddCard,
  onDeleteCard,
  onUpdateCard,
  onExternalDrop,
  onRename,
  onColorChange,
  onDelete,
}: {
  column: KanbanColumn
  onDragOver: (e: React.DragEvent) => void
  onDrop: (targetColId: string, insertIndex?: number) => void
  onAddCard: (colId: string, title: string) => void
  onDeleteCard: (colId: string, cardId: string) => void
  onUpdateCard: (colId: string, cardId: string, patch: Partial<KanbanCard>) => void
  onExternalDrop: (card: KanbanCard, clientX: number, clientY: number) => void
  onRename: (colId: string, title: string) => void
  onColorChange: (colId: string, color: string) => void
  onDelete: (colId: string) => void
}): React.ReactElement {
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [dropHighlight, setDropHighlight] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const submitCard = useCallback(() => {
    const trimmed = newTitle.trim()
    if (trimmed) {
      onAddCard(column.id, trimmed)
      setNewTitle('')
    }
    setAdding(false)
  }, [newTitle, column.id, onAddCard])

  return (
    <div
      onDragOver={(e) => { onDragOver(e); setDropHighlight(true) }}
      onDragLeave={() => setDropHighlight(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDropHighlight(false)
        droppedInternally = true
        onDrop(column.id)
      }}
      style={{
        minWidth: 240,
        maxWidth: 300,
        flex: '1 0 240px',
        display: 'flex',
        flexDirection: 'column',
        background: dropHighlight ? 'rgba(255,255,255,0.03)' : '#141414',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
        transition: 'background 0.12s',
      }}
    >
      <div style={{ height: 3, background: column.color, borderRadius: '8px 8px 0 0', flexShrink: 0 }} />

      <ColumnHeader
        column={column}
        cardCount={column.cards.length}
        onRename={onRename}
        onColorChange={onColorChange}
        onDelete={onDelete}
      />

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '0 10px 10px',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {column.cards.map((card, idx) => (
          <div
            key={card.id}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDropHighlight(false)
              droppedInternally = true
              onDrop(column.id, idx)
            }}
          >
            <CardItem
              card={card}
              columnId={column.id}
              onDelete={onDeleteCard}
              onUpdate={onUpdateCard}
              onExternalDrop={onExternalDrop}
            />
          </div>
        ))}

        {adding ? (
          <div style={{ padding: 2 }}>
            <input
              ref={inputRef}
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCard()
                if (e.key === 'Escape') { setAdding(false); setNewTitle('') }
                e.stopPropagation()
              }}
              onBlur={submitCard}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="Card title..."
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 5,
                color: '#ccc',
                fontSize: 12,
                padding: '6px 8px',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setAdding(true) }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.2)',
              cursor: 'pointer',
              fontSize: 12,
              padding: '6px 4px',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              borderRadius: 4,
              transition: 'color 0.12s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.2)' }}
          >
            + Add card
          </button>
        )}
      </div>
    </div>
  )
}
