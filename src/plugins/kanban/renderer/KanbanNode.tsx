import React, { useState, useCallback, useRef, useEffect } from 'react'
import { nanoid } from 'nanoid'
import { BaseNode } from '../../../renderer/src/components/BaseNode'
import { ColorPicker } from '../../../renderer/src/components/ui/color-picker'
import { useNodeStore, type NodeData } from '../../../renderer/src/stores/nodeStore'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KanbanCard {
  id: string
  title: string
  description?: string
}

interface KanbanColumn {
  id: string
  title: string
  color: string
  cards: KanbanCard[]
}

interface KanbanBoard {
  id: string
  name: string
  columns: KanbanColumn[]
}

interface KanbanState {
  boards: KanbanBoard[]
  activeBoardId: string
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_COLORS = ['#868e96', '#1c7ed6', '#f08c00', '#2f9e44']

function createDefaultBoard(): KanbanBoard {
  return {
    id: nanoid(8),
    name: 'Board 1',
    columns: [
      { id: nanoid(8), title: 'BACKLOG', color: DEFAULT_COLORS[0], cards: [] },
      { id: nanoid(8), title: 'IN PROGRESS', color: DEFAULT_COLORS[1], cards: [] },
      { id: nanoid(8), title: 'REVIEW', color: DEFAULT_COLORS[2], cards: [] },
      { id: nanoid(8), title: 'DONE', color: DEFAULT_COLORS[3], cards: [] },
    ],
  }
}

function getInitialState(props: Record<string, unknown>): KanbanState {
  if (props.kanbanState) return props.kanbanState as KanbanState
  const board = createDefaultBoard()
  return { boards: [board], activeBoardId: board.id }
}

// ---------------------------------------------------------------------------
// Drag state (module-level to avoid re-renders during drag)
// ---------------------------------------------------------------------------

let dragCardId: string | null = null
let dragSourceColId: string | null = null

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CardItem({
  card,
  columnId,
  onDelete,
  onUpdate,
}: {
  card: KanbanCard
  columnId: string
  onDelete: (colId: string, cardId: string) => void
  onUpdate: (colId: string, cardId: string, patch: Partial<KanbanCard>) => void
}): React.ReactElement {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(card.title)
  const [descDraft, setDescDraft] = useState(card.description ?? '')
  const [hovered, setHovered] = useState(false)

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
        e.dataTransfer.effectAllowed = 'move'
        // Make the ghost semi-transparent
        const el = e.currentTarget as HTMLElement
        el.style.opacity = '0.4'
      }}
      onDragEnd={(e) => {
        (e.currentTarget as HTMLElement).style.opacity = '1'
        dragCardId = null
        dragSourceColId = null
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={(e) => {
        e.stopPropagation()
        setDraft(card.title)
        setDescDraft(card.description ?? '')
        setEditing(true)
      }}
      style={{
        background: '#1a1a1a',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 6,
        padding: '8px 10px',
        cursor: editing ? 'text' : 'grab',
        transition: 'border-color 0.12s, background 0.12s',
        position: 'relative',
        ...(hovered && !editing ? { borderColor: 'rgba(255,255,255,0.15)', background: '#1e1e1e' } : {}),
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
          {/* Drag handle dots */}
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

          {/* Delete button */}
          {hovered && (
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
      {/* Status dot */}
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

      {/* Card count */}
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 600, marginLeft: -2 }}>
        {cardCount}
      </span>

      <div style={{ flex: 1 }} />

      {/* Color picker */}
      {hovered && (
        <ColorPicker
          color={column.color}
          onChange={(c) => onColorChange(column.id, c)}
          swatchSize={14}
        />
      )}

      {/* Delete column */}
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
  const { update } = useNodeStore()
  const [state, setState] = useState<KanbanState>(() => getInitialState(node.props))
  const [boardMenuOpen, setBoardMenuOpen] = useState(false)
  const boardMenuRef = useRef<HTMLDivElement>(null)

  // Persist to node props on state change
  const persist = useCallback(
    (next: KanbanState) => {
      setState(next)
      update(node.id, { props: { ...node.props, kanbanState: next } })
    },
    [node.id, node.props, update],
  )

  const activeBoard = state.boards.find((b) => b.id === state.activeBoardId) ?? state.boards[0]

  // Close board menu on outside click
  useEffect(() => {
    if (!boardMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (boardMenuRef.current && !boardMenuRef.current.contains(e.target as Node)) setBoardMenuOpen(false)
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [boardMenuOpen])

  // ----- Board operations -----

  const addBoard = useCallback(() => {
    const board = createDefaultBoard()
    board.name = `Board ${state.boards.length + 1}`
    persist({ boards: [...state.boards, board], activeBoardId: board.id })
    setBoardMenuOpen(false)
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

  // ----- Drag & drop between columns -----

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDropOnColumn = useCallback(
    (targetColId: string, insertIndex?: number) => {
      if (!dragCardId || !dragSourceColId) return
      if (dragSourceColId === targetColId && insertIndex === undefined) return

      const cardId = dragCardId
      const srcColId = dragSourceColId

      const srcCol = activeBoard.columns.find((c) => c.id === srcColId)
      if (!srcCol) return
      const card = srcCol.cards.find((c) => c.id === cardId)
      if (!card) return

      const newColumns = activeBoard.columns.map((col) => {
        if (col.id === srcColId && col.id === targetColId) {
          // Reorder within same column
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
      dragCardId = null
      dragSourceColId = null
    },
    [activeBoard, updateBoard],
  )

  return (
    <BaseNode node={node}>
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
          {/* Add board button */}
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
              onRename={renameColumn}
              onColorChange={changeColumnColor}
              onDelete={removeColumn}
            />
          ))}

          {/* Add column */}
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
      {/* Color bar at top */}
      <div style={{ height: 3, background: column.color, borderRadius: '8px 8px 0 0', flexShrink: 0 }} />

      <ColumnHeader
        column={column}
        cardCount={column.cards.length}
        onRename={onRename}
        onColorChange={onColorChange}
        onDelete={onDelete}
      />

      {/* Cards */}
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
              onDrop(column.id, idx)
            }}
          >
            <CardItem
              card={card}
              columnId={column.id}
              onDelete={onDeleteCard}
              onUpdate={onUpdateCard}
            />
          </div>
        ))}

        {/* Add card */}
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
