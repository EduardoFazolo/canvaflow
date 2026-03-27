import React, { useState, useRef, useEffect, useCallback } from 'react'

/**
 * Excalidraw-style color picker — a compact grid of preset colors
 * with a "current color" swatch that toggles the palette popover.
 */

const PRESET_COLORS = [
  // Row 1 — vivid
  '#e03131', '#e8590c', '#f08c00', '#e6b800', '#2f9e44',
  '#1098ad', '#1c7ed6', '#4263eb', '#7048e8', '#ae3ec9',
  // Row 2 — muted / pastel
  '#ff6b6b', '#ff922b', '#fcc419', '#a9e34b', '#51cf66',
  '#66d9e8', '#74c0fc', '#91a7ff', '#b197fc', '#e599f7',
  // Row 3 — neutrals
  '#868e96', '#adb5bd', '#ced4da', '#dee2e6', '#f8f9fa',
]

const COLS = 5

interface ColorPickerProps {
  color: string
  onChange: (color: string) => void
  /** Size of the trigger swatch in px (default 16) */
  swatchSize?: number
}

export function ColorPicker({ color, onChange, swatchSize = 16 }: ColorPickerProps): React.ReactElement {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [open])

  const pick = useCallback((c: string) => {
    onChange(c)
    setOpen(false)
  }, [onChange])

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }}>
      {/* Trigger swatch */}
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((p) => !p) }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: swatchSize,
          height: swatchSize,
          borderRadius: 4,
          background: color,
          border: '1.5px solid rgba(255,255,255,0.15)',
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
          transition: 'border-color 0.15s',
        }}
        title="Pick color"
      />

      {/* Popover */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: swatchSize + 6,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1e1e1e',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            padding: 8,
            zIndex: 9999,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gap: 4,
            width: COLS * 28 + (COLS - 1) * 4 + 16,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => pick(c)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 4,
                background: c,
                border: c === color ? '2px solid #fff' : '2px solid transparent',
                cursor: 'pointer',
                padding: 0,
                transition: 'transform 0.1s, border-color 0.1s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.15)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
