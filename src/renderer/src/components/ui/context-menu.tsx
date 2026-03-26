import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

interface ContextMenuCtx {
  open: boolean
  x: number
  y: number
  close: () => void
  openAt: (x: number, y: number) => void
}

const Ctx = createContext<ContextMenuCtx>({
  open: false, x: 0, y: 0,
  close: () => {},
  openAt: () => {},
})

export function useContextMenu(): ContextMenuCtx {
  return useContext(Ctx)
}

// Root — provides state, renders trigger wrapper + portal content
export function ContextMenu({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, setState] = useState({ open: false, x: 0, y: 0 })
  const close = useCallback(() => setState(s => ({ ...s, open: false })), [])
  const openAt = useCallback((x: number, y: number) => setState({ open: true, x, y }), [])

  useEffect(() => {
    if (!state.open) return
    // bubble phase — ContextMenuContent stops propagation so clicks inside don't close it
    const onDown = () => close()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [state.open, close])

  return (
    <Ctx.Provider value={{ ...state, close, openAt }}>
      {children}
    </Ctx.Provider>
  )
}

// Trigger — fires openAt on contextmenu; also calls any extra onContextMenu for side-effects
interface TriggerProps {
  children: React.ReactNode
  onContextMenu?: (e: React.MouseEvent) => void
  /** Return false to let the native context menu through instead */
  shouldOpen?: (e: React.MouseEvent) => boolean
  style?: React.CSSProperties
}

export function ContextMenuTrigger({ children, onContextMenu, shouldOpen, style }: TriggerProps): React.ReactElement {
  const { openAt } = useContext(Ctx)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (shouldOpen && !shouldOpen(e)) return  // let native menu through
    e.preventDefault()
    e.stopPropagation()
    onContextMenu?.(e)   // side-effect first (e.g. capture world position)
    openAt(e.clientX, e.clientY)
  }, [onContextMenu, shouldOpen, openAt])

  return (
    <div style={{ display: 'contents', ...style }} onContextMenu={handleContextMenu}>
      {children}
    </div>
  )
}

// Content — fixed-position popup, flips near edges
export function ContextMenuContent({ children }: { children: React.ReactNode }): React.ReactElement | null {
  const { open, x, y } = useContext(Ctx)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useEffect(() => {
    if (!open || !ref.current) { setPos({ x, y }); return }
    const rect = ref.current.getBoundingClientRect()
    setPos({
      x: x + rect.width > window.innerWidth ? x - rect.width : x,
      y: y + rect.height > window.innerHeight ? y - rect.height : y,
    })
  }, [open, x, y])

  if (!open) return null

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        background: 'hsl(0 0% 10%)',
        border: '1px solid hsl(0 0% 20%)',
        borderRadius: 6,
        padding: '4px 0',
        minWidth: 180,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        fontSize: 13,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}

// Item
interface ItemProps {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  destructive?: boolean
}

export function ContextMenuItem({ children, onClick, disabled, destructive }: ItemProps): React.ReactElement {
  const { close } = useContext(Ctx)
  return (
    <div
      style={{
        padding: '6px 14px',
        cursor: disabled ? 'default' : 'pointer',
        color: destructive ? 'hsl(0 72% 60%)' : disabled ? 'hsl(0 0% 40%)' : 'hsl(0 0% 90%)',
        borderRadius: 4,
        margin: '0 4px',
      }}
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.background = 'hsl(0 0% 18%)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '' }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={disabled ? undefined : () => { onClick?.(); close() }}
    >
      {children}
    </div>
  )
}

export function ContextMenuSeparator(): React.ReactElement {
  return <div style={{ height: 1, background: 'hsl(0 0% 18%)', margin: '4px 0' }} />
}

// Sub-menu (hover to reveal)
export function ContextMenuSub({ children, trigger }: { children: React.ReactNode; trigger: React.ReactNode }): React.ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <div
        style={{ padding: '6px 14px', cursor: 'pointer', color: 'hsl(0 0% 90%)', display: 'flex', justifyContent: 'space-between', borderRadius: 4, margin: '0 4px' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'hsl(0 0% 18%)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '' }}
      >
        {trigger}
        <span style={{ opacity: 0.5, fontSize: 10, marginLeft: 8 }}>▶</span>
      </div>
      {open && (
        <div style={{
          position: 'absolute', left: '100%', top: 0,
          background: 'hsl(0 0% 10%)', border: '1px solid hsl(0 0% 20%)',
          borderRadius: 6, padding: '4px 0', minWidth: 140,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 10000,
        }}>
          {children}
        </div>
      )}
    </div>
  )
}
