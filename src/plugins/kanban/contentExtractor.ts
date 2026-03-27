// ---------------------------------------------------------------------------
// Extract full plain text and image sources from TipTap JSON content
// ---------------------------------------------------------------------------

interface TipTapNode {
  type: string
  text?: string
  content?: TipTapNode[]
  attrs?: Record<string, unknown>
}

export interface ExtractedContent {
  text: string
  images: string[]
}

/**
 * Recursively extracts plain text and image sources from TipTap JSON.
 * Block-level nodes (paragraphs, headings, list items) are separated by newlines.
 */
export function extractFromTipTap(node: TipTapNode | null | undefined): ExtractedContent {
  if (!node) return { text: '', images: [] }

  const parts: string[] = []
  const images: string[] = []

  function walk(n: TipTapNode): void {
    if (n.type === 'text' && n.text) {
      parts.push(n.text)
      return
    }

    if (n.type === 'image' && n.attrs?.src) {
      images.push(n.attrs.src as string)
      return
    }

    if (n.content) {
      for (const child of n.content) {
        walk(child)
      }
    }

    // Add newline after block-level elements
    const blockTypes = ['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'codeBlock']
    if (blockTypes.includes(n.type)) {
      parts.push('\n')
    }
  }

  walk(node)

  return {
    text: parts.join('').replace(/\n{3,}/g, '\n\n').trim(),
    images,
  }
}

/**
 * Builds the full task prompt from a kanban card.
 * Uses card.content (TipTap JSON) for full text when available,
 * falls back to card.description.
 */
export function buildTaskPrompt(card: { title: string; description?: string; content?: object }): ExtractedContent {
  const extracted = extractFromTipTap(card.content as TipTapNode | undefined)
  const bodyText = extracted.text || card.description || ''

  return {
    text: bodyText ? `${card.title}\n\n${bodyText}` : card.title,
    images: extracted.images,
  }
}
