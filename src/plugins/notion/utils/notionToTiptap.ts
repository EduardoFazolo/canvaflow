/**
 * Unwrap a Notion block entry from the API response.
 * API v3 returns `{ value: { value: { id, type, ... } } }`,
 * while older responses return `{ value: { id, type, ... } }`.
 */
export function unwrapBlockValue(entry: any): any {
  const v = entry?.value
  return v?.value?.id ? v.value : v
}

// Gray animated loading placeholder shown while a Notion image is being fetched
export const IMAGE_LOADING_PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="140">' +
  '<rect width="600" height="140" rx="6" fill="#f3f3f3"/>' +
  '<text x="300" y="75" font-family="system-ui,sans-serif" font-size="13" fill="#aaa" text-anchor="middle" dominant-baseline="middle">Loading image…</text>' +
  '</svg>'
)}`

// Notion rich text segment: [text, [[decoration, value?], ...][]]
type NotionText = [string, string[][]?]

function convertRichText(richText: NotionText[] | undefined): any[] {
  if (!richText) return []
  return richText.map(([text, decorations]) => {
    const marks: any[] = []
    for (const dec of decorations ?? []) {
      const [type, value] = dec
      if (type === 'b') marks.push({ type: 'bold' })
      else if (type === 'i') marks.push({ type: 'italic' })
      else if (type === 's') marks.push({ type: 'strike' })
      else if (type === 'c') marks.push({ type: 'code' })
      else if (type === 'a') marks.push({ type: 'link', attrs: { href: value ?? '' } })
    }
    return marks.length > 0
      ? { type: 'text', text, marks }
      : { type: 'text', text }
  }).filter(n => n.text !== '')
}

function notionBlockToTiptap(
  blockId: string,
  blocks: Record<string, { value: any }>,
  visited = new Set<string>(),
  imageMap: Record<string, string> = {}
): any[] {
  if (visited.has(blockId)) return []
  visited.add(blockId)

  const record = blocks[blockId]
  if (!record) return []
  const block = record.value

  const title: NotionText[] = block.properties?.title ?? []
  const children = (block.content ?? []).flatMap((id: string) =>
    notionBlockToTiptap(id, blocks, visited, imageMap)
  )

  switch (block.type) {
    case 'page':
      // Skip the page block itself — children already include content
      return children

    case 'image': {
      const src: string | undefined = block.format?.display_source ?? block.properties?.source?.[0]?.[0]
      if (!src) return children
      // imageMap key is the raw src (including attachment: URLs); resolves to data URL when loaded
      const resolvedSrc = imageMap[src] ?? IMAGE_LOADING_PLACEHOLDER
      return [{ type: 'image', attrs: { src: resolvedSrc, alt: '', title: null } }, ...children]
    }

    case 'text':
    case 'paragraph': {
      const inline = convertRichText(title)
      if (inline.length === 0 && children.length === 0) return [{ type: 'paragraph', content: [] }]
      const nodes: any[] = [{ type: 'paragraph', content: inline }]
      return [...nodes, ...children]
    }

    case 'header':
      return [{ type: 'heading', attrs: { level: 1 }, content: convertRichText(title) }, ...children]

    case 'sub_header':
      return [{ type: 'heading', attrs: { level: 2 }, content: convertRichText(title) }, ...children]

    case 'sub_sub_header':
      return [{ type: 'heading', attrs: { level: 3 }, content: convertRichText(title) }, ...children]

    case 'bulleted_list':
      return [{
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph', content: convertRichText(title) }, ...children] }]
      }]

    case 'numbered_list':
      return [{
        type: 'orderedList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph', content: convertRichText(title) }, ...children] }]
      }]

    case 'quote':
      return [{ type: 'blockquote', content: [{ type: 'paragraph', content: convertRichText(title) }] }, ...children]

    case 'code': {
      const codeText = title.map(([t]) => t).join('')
      return [{ type: 'codeBlock', content: [{ type: 'text', text: codeText }] }, ...children]
    }

    case 'divider':
      return [{ type: 'horizontalRule' }, ...children]

    case 'toggle':
      // Render as paragraph + indented children
      return [{ type: 'paragraph', content: convertRichText(title) }, ...children]

    case 'callout':
      return [{ type: 'blockquote', content: [{ type: 'paragraph', content: convertRichText(title) }] }, ...children]

    default:
      // Unknown block — if it has title text, render as paragraph
      if (title.length > 0) {
        return [{ type: 'paragraph', content: convertRichText(title) }, ...children]
      }
      return children
  }
}

export function notionChunkToTiptap(
  pageId: string,
  rawBlocks: Record<string, any>,
  imageMap: Record<string, string> = {}
): object {
  // Normalize blocks to flat { value: { id, type, ... } } form
  const blocks: Record<string, { value: any }> = {}
  for (const [id, entry] of Object.entries(rawBlocks)) {
    blocks[id] = { value: unwrapBlockValue(entry) }
  }

  const uuid = pageId.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')

  const pageBlock = blocks[uuid] ?? blocks[pageId]
  if (!pageBlock) return { type: 'doc', content: [{ type: 'paragraph', content: [] }] }

  // Title as H1 at the top of the note
  const titleText: NotionText[] = pageBlock.value.properties?.title ?? []
  const titleNode = titleText.length > 0
    ? [{ type: 'heading', attrs: { level: 1 }, content: convertRichText(titleText) }]
    : []

  const content = notionBlockToTiptap(pageBlock.value.id ?? uuid, blocks, new Set(), imageMap)
  const merged = mergeAdjacentLists(content)

  return {
    type: 'doc',
    content: [...titleNode, ...(merged.length > 0 ? merged : [{ type: 'paragraph', content: [] }])],
  }
}

// Notion emits each list item as its own bulletList/orderedList node.
// TipTap expects all consecutive items inside a single list node.
function mergeAdjacentLists(nodes: any[]): any[] {
  const result: any[] = []
  for (const node of nodes) {
    const prev = result[result.length - 1]
    if (prev && prev.type === node.type && (node.type === 'bulletList' || node.type === 'orderedList')) {
      prev.content = [...prev.content, ...node.content]
    } else {
      result.push({ ...node })
    }
  }
  return result
}
