import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import { NodeData, useNodeStore } from '../stores/nodeStore'
import { BaseNode } from './BaseNode'
import { ContextMenuItem } from './ui/context-menu'

const TITLE_H = 32
const TOOLBAR_H = 34

// ---------------------------------------------------------------------------
// Toolbar button
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
      onPointerDown={(e) => e.preventDefault()} // prevent editor blur
      onClick={onClick}
      style={{
        width: 24, height: 24,
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
  return <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)', flexShrink: 0, margin: '0 2px' }} />
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }): React.ReactElement | null {
  if (!editor) return null

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        height: TOOLBAR_H,
        display: 'flex', alignItems: 'center', gap: 2,
        padding: '0 8px',
        background: '#141414',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
        overflowX: 'auto',
      }}
    >
      {/* Headings */}
      <ToolbarBtn
        title="Heading 1"
        active={editor.isActive('heading', { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <span style={{ fontSize: 10, fontWeight: 700 }}>H1</span>
      </ToolbarBtn>
      <ToolbarBtn
        title="Heading 2"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <span style={{ fontSize: 10, fontWeight: 700 }}>H2</span>
      </ToolbarBtn>
      <ToolbarBtn
        title="Heading 3"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <span style={{ fontSize: 10, fontWeight: 700 }}>H3</span>
      </ToolbarBtn>

      <Divider />

      {/* Inline marks */}
      <ToolbarBtn
        title="Bold (⌘B)"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M3 2h3.5a2 2 0 1 1 0 4H3V2zm0 4h4a2 2 0 1 1 0 4H3V6z" fill="currentColor"/>
        </svg>
      </ToolbarBtn>
      <ToolbarBtn
        title="Italic (⌘I)"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M7 2H4.5M6.5 9H4M6 2L5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </ToolbarBtn>
      <ToolbarBtn
        title="Strikethrough"
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M2 5.5h7M4 2.5c0-.83 1.34-1 1.5-1 1.2 0 2 .67 2 1.5 0 1-1 1.5-2 1.5M3.5 7c0 .83.67 1.5 2 1.5s2-.67 2-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </ToolbarBtn>
      <ToolbarBtn
        title="Inline code"
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M3.5 3L1 5.5 3.5 8M7.5 3L10 5.5 7.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </ToolbarBtn>

      <Divider />

      {/* Lists */}
      <ToolbarBtn
        title="Bullet list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <circle cx="2" cy="3" r="1" fill="currentColor"/>
          <circle cx="2" cy="6" r="1" fill="currentColor"/>
          <circle cx="2" cy="9" r="1" fill="currentColor"/>
          <path d="M4.5 3h5M4.5 6h5M4.5 9h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </ToolbarBtn>
      <ToolbarBtn
        title="Ordered list"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M1.5 2v3M1 4.5h1M4.5 3h5M4.5 6h5M4.5 9h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <path d="M1 7.5c0-.55.45-1 1-1s1 .45 1 1-.9 1.5-2 2h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </ToolbarBtn>

      <Divider />

      {/* Block */}
      <ToolbarBtn
        title="Blockquote"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M2 3.5c0 1.5.5 2 1.5 2M5 3.5c0 1.5.5 2 1.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          <path d="M2 8h3M6 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeOpacity="0.5"/>
        </svg>
      </ToolbarBtn>
      <ToolbarBtn
        title="Code block"
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <rect x="1" y="1.5" width="9" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.1"/>
          <path d="M3.5 4L2 5.5 3.5 7M7.5 4L9 5.5 7.5 7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </ToolbarBtn>
      <ToolbarBtn
        title="Horizontal rule"
        active={false}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M1 5.5h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </ToolbarBtn>

      <Divider />

      {/* History */}
      <ToolbarBtn
        title="Undo (⌘Z)"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M2 5.5A4 4 0 1 1 4.5 9M2 2.5v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </ToolbarBtn>
      <ToolbarBtn
        title="Redo (⌘⇧Z)"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <path d="M9 5.5A4 4 0 1 0 6.5 9M9 2.5v3H6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </ToolbarBtn>
    </div>
  )
}

// ---------------------------------------------------------------------------
// NoteNode
// ---------------------------------------------------------------------------

interface Props {
  node: NodeData
}

export function NoteNode({ node }: Props): React.ReactElement {
  const { update } = useNodeStore()
  const [showToolbar, setShowToolbar] = useState((node.props.showToolbar as boolean) ?? true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const externalUpdateRef = useRef(false)

  const toolbarVisible = showToolbar
  const contentH = node.height - TITLE_H - (toolbarVisible ? TOOLBAR_H : 0)

  const toggleToolbar = useCallback(() => {
    setShowToolbar((v) => {
      const next = !v
      const currentProps = useNodeStore.getState().nodes.get(node.id)?.props ?? {}
      update(node.id, { props: { ...currentProps, showToolbar: next } })
      return next
    })
  }, [node.id, update])

  const editor = useEditor({
    extensions: [StarterKit, Image.configure({ inline: false, allowBase64: true })],
    content: (node.props.content as object | string | undefined) ?? '<p></p>',
    editorProps: {
      attributes: {
        style: 'outline: none; height: 100%; box-sizing: border-box;',
      },
    },
    onUpdate: ({ editor }) => {
      // Skip saving if the change was injected externally (async drop fill)
      if (externalUpdateRef.current) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        const currentProps = useNodeStore.getState().nodes.get(node.id)?.props ?? {}
        update(node.id, { props: { ...currentProps, content: editor.getJSON() } })
      }, 500)
    },
  })

  // When content is updated externally (e.g. async Notion fetch fills in after drop),
  // push it into the live editor without triggering the save debounce.
  const propsContent = node.props.content
  useEffect(() => {
    if (!editor || !propsContent) return
    const editorJson = JSON.stringify(editor.getJSON())
    const propsJson = JSON.stringify(propsContent)
    if (editorJson !== propsJson) {
      externalUpdateRef.current = true
      editor.commands.setContent(propsContent as any, false)
      externalUpdateRef.current = false
    }
  }, [editor, propsContent])

  // Cleanup timer on unmount
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  return (
        <BaseNode
          node={node}
          contextMenuExtra={
            <ContextMenuItem onClick={toggleToolbar}>
              {showToolbar ? 'Hide Toolbar' : 'Show Toolbar'}
            </ContextMenuItem>
          }
          titleExtra={
            <button
              title={showToolbar ? 'Hide toolbar' : 'Show toolbar'}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={toggleToolbar}
              style={{
                width: 20, height: 20, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: showToolbar ? 'rgba(255,255,255,0.07)' : 'transparent',
                border: 'none', borderRadius: 3,
                color: showToolbar ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)',
                cursor: 'pointer', padding: 0,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 3h8M1 5.5h5M1 8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            </button>
          }
        >
          <div
            style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {toolbarVisible && <Toolbar editor={editor} />}

            <div
              style={{
                flex: 1,
                height: contentH,
                overflowY: 'auto',
                padding: '12px 14px',
              }}
              onClick={() => editor?.commands.focus()}
            >
              <style>{editorStyles}</style>
              <EditorContent editor={editor} style={{ height: '100%' }} />
            </div>
          </div>
        </BaseNode>
  )
}

// ---------------------------------------------------------------------------
// Editor styles (scoped via class)
// ---------------------------------------------------------------------------

const editorStyles = `
  .tiptap {
    color: rgba(255,255,255,0.82);
    font-size: 13px;
    line-height: 1.65;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    min-height: 100%;
    caret-color: rgba(167,139,250,0.9);
  }
  .tiptap p { margin: 0 0 6px 0; }
  .tiptap p:last-child { margin-bottom: 0; }
  .tiptap h1 { font-size: 20px; font-weight: 700; margin: 0 0 8px 0; color: rgba(255,255,255,0.92); }
  .tiptap h2 { font-size: 16px; font-weight: 600; margin: 0 0 6px 0; color: rgba(255,255,255,0.88); }
  .tiptap h3 { font-size: 14px; font-weight: 600; margin: 0 0 5px 0; color: rgba(255,255,255,0.85); }
  .tiptap strong { color: rgba(255,255,255,0.92); }
  .tiptap em { color: rgba(255,255,255,0.7); }
  .tiptap s { color: rgba(255,255,255,0.35); }
  .tiptap code {
    font-family: 'JetBrains Mono', 'Fira Code', Menlo, monospace;
    font-size: 12px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 3px;
    padding: 1px 5px;
    color: rgba(167,139,250,0.9);
  }
  .tiptap pre {
    background: rgba(0,0,0,0.35);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    padding: 10px 12px;
    margin: 0 0 8px 0;
    overflow-x: auto;
  }
  .tiptap pre code {
    background: none;
    border: none;
    padding: 0;
    font-size: 12px;
    color: rgba(255,255,255,0.75);
  }
  .tiptap blockquote {
    border-left: 3px solid rgba(167,139,250,0.4);
    padding-left: 12px;
    margin: 0 0 8px 0;
    color: rgba(255,255,255,0.5);
    font-style: italic;
  }
  .tiptap ul, .tiptap ol {
    padding-left: 20px;
    margin: 0 0 6px 0;
  }
  .tiptap li { margin-bottom: 2px; }
  .tiptap li p { margin-bottom: 0; }
  .tiptap hr {
    border: none;
    border-top: 1px solid rgba(255,255,255,0.1);
    margin: 10px 0;
  }
  .tiptap .is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    color: rgba(255,255,255,0.18);
    pointer-events: none;
    float: left;
    height: 0;
  }
`
