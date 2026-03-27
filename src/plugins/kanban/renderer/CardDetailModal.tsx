import React, { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import type { KanbanCard } from '../store'

// ---------------------------------------------------------------------------
// Toolbar button (reused from NoteNode pattern)
// ---------------------------------------------------------------------------

function ToolbarBtn({
  active, disabled, title, onClick, children,
}: {
  active?: boolean
  disabled?: boolean
  title: string
  onClick: () => void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      title={title}
      disabled={disabled}
      onPointerDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        width: 26, height: 26,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'rgba(167,139,250,0.18)' : 'transparent',
        border: active ? '1px solid rgba(167,139,250,0.3)' : '1px solid transparent',
        borderRadius: 4,
        color: active ? 'rgba(167,139,250,0.9)' : disabled ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.45)',
        cursor: disabled ? 'default' : 'pointer',
        padding: 0, flexShrink: 0,
        transition: 'background 0.1s, color 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!disabled && !active)
          (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'
      }}
      onMouseLeave={(e) => {
        if (!active)
          (e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}

function Divider(): React.ReactElement {
  return <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)', flexShrink: 0, margin: '0 2px' }} />
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }): React.ReactElement | null {
  if (!editor) return null

  const addImage = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          editor.chain().focus().setImage({ src: reader.result }).run()
        }
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }, [editor])

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '6px 8px',
        background: 'rgba(255,255,255,0.02)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '8px 8px 0 0',
        flexWrap: 'wrap',
      }}
    >
      <ToolbarBtn title="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <span style={{ fontSize: 10, fontWeight: 700 }}>H1</span>
      </ToolbarBtn>
      <ToolbarBtn title="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <span style={{ fontSize: 10, fontWeight: 700 }}>H2</span>
      </ToolbarBtn>
      <ToolbarBtn title="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <span style={{ fontSize: 10, fontWeight: 700 }}>H3</span>
      </ToolbarBtn>

      <Divider />

      <ToolbarBtn title="Bold (⌘B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M3 2h3.5a2 2 0 1 1 0 4H3V2zm0 4h4a2 2 0 1 1 0 4H3V6z" fill="currentColor"/></svg>
      </ToolbarBtn>
      <ToolbarBtn title="Italic (⌘I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M7 2H4.5M6.5 9H4M6 2L5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
      </ToolbarBtn>
      <ToolbarBtn title="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5h7M4 2.5c0-.83 1.34-1 1.5-1 1.2 0 2 .67 2 1.5 0 1-1 1.5-2 1.5M3.5 7c0 .83.67 1.5 2 1.5s2-.67 2-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
      </ToolbarBtn>
      <ToolbarBtn title="Inline code" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M3.5 3L1 5.5 3.5 8M7.5 3L10 5.5 7.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </ToolbarBtn>

      <Divider />

      <ToolbarBtn title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="2" cy="3" r="1" fill="currentColor"/><circle cx="2" cy="6" r="1" fill="currentColor"/><circle cx="2" cy="9" r="1" fill="currentColor"/><path d="M4.5 3h5M4.5 6h5M4.5 9h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
      </ToolbarBtn>
      <ToolbarBtn title="Ordered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 2v3M1 4.5h1M4.5 3h5M4.5 6h5M4.5 9h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M1 7.5c0-.55.45-1 1-1s1 .45 1 1-.9 1.5-2 2h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </ToolbarBtn>

      <Divider />

      <ToolbarBtn title="Blockquote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 3.5c0 1.5.5 2 1.5 2M5 3.5c0 1.5.5 2 1.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M2 8h3M6 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5"/></svg>
      </ToolbarBtn>
      <ToolbarBtn title="Code block" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="1.5" width="9" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.1"/><path d="M3.5 4L2 5.5 3.5 7M7.5 4L9 5.5 7.5 7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </ToolbarBtn>
      <ToolbarBtn title="Horizontal rule" active={false} onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1 5.5h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
      </ToolbarBtn>

      <Divider />

      <ToolbarBtn title="Add image" active={false} onClick={addImage}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <rect x="1" y="2" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.1"/>
          <circle cx="4" cy="5" r="1" fill="currentColor"/>
          <path d="M1 9l3-3 2 2 2-2 3 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </ToolbarBtn>

      <Divider />

      <ToolbarBtn title="Undo (⌘Z)" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 5.5A4 4 0 1 1 4.5 9M2 2.5v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </ToolbarBtn>
      <ToolbarBtn title="Redo (⌘⇧Z)" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M9 5.5A4 4 0 1 0 6.5 9M9 2.5v3H6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </ToolbarBtn>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card Detail Modal
// ---------------------------------------------------------------------------

interface CardDetailModalProps {
  card: KanbanCard
  onUpdate: (patch: Partial<KanbanCard>) => void
  onClose: () => void
}

export function CardDetailModal({ card, onUpdate, onClose }: CardDetailModalProps): React.ReactElement {
  const [title, setTitle] = useState(card.title)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Build initial content from card.content or card.description
  const initialContent = card.content
    ? card.content
    : card.description
      ? `<p>${card.description.replace(/\n/g, '</p><p>')}</p>`
      : '<p></p>'

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ inline: false, allowBase64: true }),
    ],
    content: initialContent as any,
    editorProps: {
      attributes: {
        style: 'outline: none; min-height: 200px; box-sizing: border-box;',
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            event.preventDefault()
            const file = item.getAsFile()
            if (!file) continue
            const reader = new FileReader()
            reader.onload = () => {
              if (typeof reader.result === 'string') {
                view.dispatch(view.state.tr)
                ;(editor as any)?.chain().focus().setImage({ src: reader.result }).run()
              }
            }
            reader.readAsDataURL(file)
            return true
          }
        }
        return false
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files
        if (!files?.length) return false
        for (const file of Array.from(files)) {
          if (file.type.startsWith('image/')) {
            event.preventDefault()
            const reader = new FileReader()
            reader.onload = () => {
              if (typeof reader.result === 'string') {
                ;(editor as any)?.chain().focus().setImage({ src: reader.result }).run()
              }
            }
            reader.readAsDataURL(file)
            return true
          }
        }
        return false
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        const json = ed.getJSON()
        const plainText = ed.getText()
        onUpdate({ content: json, description: plainText.slice(0, 200) || undefined })
      }, 400)
    },
  })

  // Save title changes with debounce
  const handleTitleChange = useCallback((val: string) => {
    setTitle(val)
    if (titleTimer.current) clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(() => {
      const trimmed = val.trim()
      if (trimmed) onUpdate({ title: trimmed })
    }, 400)
  }, [onUpdate])

  // Cleanup timers
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (titleTimer.current) clearTimeout(titleTimer.current)
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          width: 640,
          maxWidth: '90vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#1a1a1a',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Title */}
        <div style={{ padding: '16px 20px 0', flexShrink: 0 }}>
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#e0e0e0',
              fontSize: 18,
              fontWeight: 700,
              fontFamily: 'inherit',
              padding: '4px 0',
            }}
            placeholder="Card title..."
          />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginTop: 8 }} />
        </div>

        {/* Toolbar */}
        <div style={{ flexShrink: 0, padding: '4px 12px 0' }}>
          <Toolbar editor={editor} />
        </div>

        {/* Editor */}
        <div
          className="card-detail-editor"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 20px 20px',
          }}
          onClick={() => editor?.commands.focus()}
        >
          <style>{editorStyles}</style>
          <EditorContent editor={editor} style={{ minHeight: 200 }} />
        </div>

        {/* Footer hint */}
        <div style={{
          padding: '8px 20px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
            Paste images with ⌘V | Supports markdown formatting
          </span>
          <button
            onClick={onClose}
            style={{
              fontSize: 12, padding: '4px 14px', borderRadius: 6,
              background: 'rgba(255,255,255,0.08)', border: 'none',
              color: '#aaa', cursor: 'pointer',
              transition: 'background 0.12s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// Editor styles (scoped via .tiptap class)
// ---------------------------------------------------------------------------

const editorStyles = `
  .card-detail-editor .tiptap {
    color: rgba(255,255,255,0.82);
    font-size: 14px;
    line-height: 1.7;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    min-height: 200px;
    caret-color: rgba(167,139,250,0.9);
  }
  .card-detail-editor .tiptap p { margin: 0 0 8px 0; }
  .card-detail-editor .tiptap p:last-child { margin-bottom: 0; }
  .card-detail-editor .tiptap h1 { font-size: 22px; font-weight: 700; margin: 0 0 10px 0; color: rgba(255,255,255,0.92); }
  .card-detail-editor .tiptap h2 { font-size: 18px; font-weight: 600; margin: 0 0 8px 0; color: rgba(255,255,255,0.88); }
  .card-detail-editor .tiptap h3 { font-size: 15px; font-weight: 600; margin: 0 0 6px 0; color: rgba(255,255,255,0.85); }
  .card-detail-editor .tiptap strong { color: rgba(255,255,255,0.92); }
  .card-detail-editor .tiptap em { color: rgba(255,255,255,0.7); }
  .card-detail-editor .tiptap s { color: rgba(255,255,255,0.35); }
  .card-detail-editor .tiptap code {
    font-family: 'JetBrains Mono', 'Fira Code', Menlo, monospace;
    font-size: 13px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 3px;
    padding: 1px 5px;
    color: rgba(167,139,250,0.9);
  }
  .card-detail-editor .tiptap pre {
    background: rgba(0,0,0,0.35);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    padding: 12px 14px;
    margin: 0 0 10px 0;
    overflow-x: auto;
  }
  .card-detail-editor .tiptap pre code {
    background: none;
    border: none;
    padding: 0;
    font-size: 13px;
    color: rgba(255,255,255,0.75);
  }
  .card-detail-editor .tiptap blockquote {
    border-left: 3px solid rgba(167,139,250,0.4);
    padding-left: 14px;
    margin: 0 0 10px 0;
    color: rgba(255,255,255,0.5);
    font-style: italic;
  }
  .card-detail-editor .tiptap ul, .card-detail-editor .tiptap ol {
    padding-left: 22px;
    margin: 0 0 8px 0;
  }
  .card-detail-editor .tiptap li { margin-bottom: 3px; }
  .card-detail-editor .tiptap li p { margin-bottom: 0; }
  .card-detail-editor .tiptap hr {
    border: none;
    border-top: 1px solid rgba(255,255,255,0.1);
    margin: 12px 0;
  }
  .card-detail-editor .tiptap img {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
    margin: 8px 0;
  }
  .card-detail-editor .tiptap .is-editor-empty:first-child::before {
    content: 'Write a description... (paste images with ⌘V)';
    color: rgba(255,255,255,0.18);
    pointer-events: none;
    float: left;
    height: 0;
  }
`
