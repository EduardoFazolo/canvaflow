import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  onConfirm: (branchName: string, fromMain: boolean) => void
  onClose: () => void
}

export function NewBranchModal({ onConfirm, onClose }: Props): React.ReactElement {
  const [name, setName] = useState('')
  const [fromMain, setFromMain] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const sanitize = (raw: string) =>
    raw.replace(/[^a-zA-Z0-9\-_/.]/g, '-').replace(/^-+|-+$/g, '')

  const handleSubmit = async () => {
    const sanitized = sanitize(name.trim())
    if (!sanitized) {
      setError('Branch name is required')
      return
    }
    setLoading(true)
    setError('')
    onConfirm(sanitized, fromMain)
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'hsl(0 0% 12%)',
          border: '1px solid hsl(0 0% 20%)',
          borderRadius: 12,
          padding: 24,
          width: 380,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 16 }}>
          New Branch Zone
        </div>

        <div style={{ fontSize: 12, color: 'hsl(0 0% 55%)', marginBottom: 12 }}>
          Creates a new git branch with its own worktree — a separate working area on your canvas.
        </div>

        <input
          ref={inputRef}
          type="text"
          placeholder="feature/my-branch"
          value={name}
          onChange={(e) => { setName(e.target.value); setError('') }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onClose() }}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: 'hsl(0 0% 8%)',
            border: error ? '1px solid hsl(0 72% 50%)' : '1px solid hsl(0 0% 22%)',
            borderRadius: 8,
            color: '#fff',
            fontSize: 14,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        {error && (
          <div style={{ fontSize: 12, color: 'hsl(0 72% 60%)', marginTop: 6 }}>{error}</div>
        )}

        {/* From main toggle */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 14,
            cursor: 'pointer',
            fontSize: 13,
            color: 'hsl(0 0% 65%)',
            userSelect: 'none',
          }}
          onClick={() => setFromMain((v) => !v)}
        >
          <div style={{
            width: 32,
            height: 18,
            borderRadius: 9,
            background: fromMain ? 'hsl(260 60% 50%)' : 'hsl(0 0% 22%)',
            position: 'relative',
            transition: 'background 0.15s',
            flexShrink: 0,
          }}>
            <div style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              background: '#fff',
              position: 'absolute',
              top: 2,
              left: fromMain ? 16 : 2,
              transition: 'left 0.15s',
            }} />
          </div>
          Branch from <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: fromMain ? 'hsl(260 60% 70%)' : 'hsl(0 0% 50%)' }}>main</span>
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid hsl(0 0% 25%)',
              borderRadius: 6,
              color: 'hsl(0 0% 60%)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: '8px 20px',
              background: loading ? 'hsl(0 0% 25%)' : 'hsl(260 60% 50%)',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              cursor: loading ? 'default' : 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
