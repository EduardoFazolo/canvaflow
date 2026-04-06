type NotionRichText = [string, string[][]?]

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escapeHtmlAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;')
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}\[\]()#+\-.!|>])/g, '\\$1')
}

function renderRichText(richText: NotionRichText[] | undefined): { text: string; markdown: string; html: string } {
  if (!richText || richText.length === 0) return { text: '', markdown: '', html: '' }

  const textParts: string[] = []
  const markdownParts: string[] = []
  const htmlParts: string[] = []

  for (const [rawText, decorations] of richText) {
    const text = rawText ?? ''
    textParts.push(text)

    let markdown = escapeMarkdown(text)
    let html = escapeHtml(text)

    for (const decoration of decorations ?? []) {
      const [type, value] = decoration
      if (type === 'b') {
        markdown = `**${markdown}**`
        html = `<strong>${html}</strong>`
      } else if (type === 'i') {
        markdown = `*${markdown}*`
        html = `<em>${html}</em>`
      } else if (type === 's') {
        markdown = `~~${markdown}~~`
        html = `<s>${html}</s>`
      } else if (type === 'c') {
        markdown = `\`${markdown}\``
        html = `<code>${html}</code>`
      } else if (type === 'a') {
        const href = value ?? ''
        markdown = `[${markdown}](${href})`
        html = `<a href="${escapeHtmlAttr(href)}">${html}</a>`
      }
    }

    markdownParts.push(markdown)
    htmlParts.push(html)
  }

  return {
    text: textParts.join(''),
    markdown: markdownParts.join(''),
    html: htmlParts.join(''),
  }
}

function appendParagraph(lines: string[], value: string): void {
  if (!value.trim()) return
  if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('')
  lines.push(value)
}

function appendHtml(parts: string[], value: string): void {
  if (!value.trim()) return
  parts.push(value)
}

function appendText(lines: string[], value: string): void {
  if (!value.trim()) return
  if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('')
  lines.push(value)
}

function renderBlocks(
  blockIds: string[],
  blocks: Record<string, { value: any }>,
  imageMap: Record<string, string>,
  visited = new Set<string>(),
  depth = 0
): { markdown: string[]; html: string[]; text: string[] } {
  const markdown: string[] = []
  const html: string[] = []
  const text: string[] = []

  for (const blockId of blockIds) {
    if (visited.has(blockId)) continue
    visited.add(blockId)

    const record = blocks[blockId]
    if (!record) continue
    const block = record.value
    const rich = renderRichText(block.properties?.title as NotionRichText[] | undefined)
    const childIds = Array.isArray(block.content) ? block.content as string[] : []
    const children = renderBlocks(childIds, blocks, imageMap, visited, depth + 1)

    if (block.type === 'page') {
      markdown.push(...children.markdown)
      html.push(...children.html)
      text.push(...children.text)
      continue
    }

    if (block.type === 'image') {
      const rawSrc = block.format?.display_source ?? block.properties?.source?.[0]?.[0]
      const src = typeof rawSrc === 'string' ? (imageMap[rawSrc] ?? rawSrc) : ''
      if (src) {
        appendParagraph(markdown, `<img src="${src}" alt="" />`)
        appendHtml(html, `<p><img src="${escapeHtmlAttr(src)}" alt="" style="max-width:100%;height:auto;" /></p>`)
        appendText(text, '[Image]')
      }
      markdown.push(...children.markdown)
      html.push(...children.html)
      text.push(...children.text)
      continue
    }

    if (block.type === 'text' || block.type === 'paragraph') {
      appendParagraph(markdown, rich.markdown)
      appendHtml(html, `<p>${rich.html || '<br />'}</p>`)
      appendText(text, rich.text)
      markdown.push(...children.markdown)
      html.push(...children.html)
      text.push(...children.text)
      continue
    }

    if (block.type === 'header' || block.type === 'sub_header' || block.type === 'sub_sub_header') {
      const level = block.type === 'header' ? 1 : block.type === 'sub_header' ? 2 : 3
      appendParagraph(markdown, `${'#'.repeat(level)} ${rich.markdown}`.trim())
      appendHtml(html, `<h${level}>${rich.html}</h${level}>`)
      appendText(text, rich.text)
      markdown.push(...children.markdown)
      html.push(...children.html)
      text.push(...children.text)
      continue
    }

    if (block.type === 'bulleted_list' || block.type === 'numbered_list') {
      const indent = '  '.repeat(depth)
      const marker = block.type === 'bulleted_list' ? '-' : '1.'
      appendParagraph(markdown, `${indent}${marker} ${rich.markdown}`.trimEnd())
      appendHtml(html, `<p>${block.type === 'bulleted_list' ? '&bull;' : '1.'} ${rich.html}</p>`)
      appendText(text, `${marker} ${rich.text}`)
      markdown.push(...children.markdown)
      html.push(...children.html)
      text.push(...children.text)
      continue
    }

    if (block.type === 'quote' || block.type === 'callout') {
      appendParagraph(markdown, `> ${rich.markdown}`.trim())
      appendHtml(html, `<blockquote><p>${rich.html}</p></blockquote>`)
      appendText(text, rich.text)
      markdown.push(...children.markdown)
      html.push(...children.html)
      text.push(...children.text)
      continue
    }

    if (block.type === 'code') {
      const codeText = rich.text
      appendParagraph(markdown, ['```', codeText, '```'].join('\n'))
      appendHtml(html, `<pre><code>${escapeHtml(codeText)}</code></pre>`)
      appendText(text, codeText)
      markdown.push(...children.markdown)
      html.push(...children.html)
      text.push(...children.text)
      continue
    }

    if (block.type === 'divider') {
      appendParagraph(markdown, '---')
      appendHtml(html, '<hr />')
      markdown.push(...children.markdown)
      html.push(...children.html)
      text.push(...children.text)
      continue
    }

    if (block.type === 'toggle') {
      appendParagraph(markdown, rich.markdown)
      appendHtml(html, `<p>${rich.html}</p>`)
      appendText(text, rich.text)
      markdown.push(...children.markdown)
      html.push(...children.html)
      text.push(...children.text)
      continue
    }

    if (rich.text.trim()) {
      appendParagraph(markdown, rich.markdown)
      appendHtml(html, `<p>${rich.html}</p>`)
      appendText(text, rich.text)
    }
    markdown.push(...children.markdown)
    html.push(...children.html)
    text.push(...children.text)
  }

  return { markdown, html, text }
}

export function buildNotionExport(
  pageId: string,
  rawBlocks: Record<string, any>,
  imageMap: Record<string, string>
): { markdown: string; html: string; text: string } {
  // Normalize Notion API v3 block wrapping ({ value: { value: {...} } } → { value: {...} })
  const blocks: Record<string, { value: any }> = {}
  for (const [id, entry] of Object.entries(rawBlocks)) {
    const v = entry?.value
    blocks[id] = v?.value?.id ? { value: v.value } : { value: v }
  }

  const uuid = pageId.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
  const pageBlock = blocks[uuid] ?? blocks[pageId]
  if (!pageBlock) return { markdown: '', html: '', text: '' }

  const title = renderRichText(pageBlock.value.properties?.title as NotionRichText[] | undefined)
  const body = renderBlocks([pageBlock.value.id ?? uuid], blocks, imageMap)

  const markdown = [
    title.markdown ? `# ${title.markdown}` : '',
    ...body.markdown,
  ].filter(Boolean).join('\n\n').trim()

  const html = [
    title.html ? `<h1>${title.html}</h1>` : '',
    ...body.html,
  ].filter(Boolean).join('\n').trim()

  const text = [
    title.text,
    ...body.text,
  ].filter(Boolean).join('\n\n').trim()

  return { markdown, html, text }
}
