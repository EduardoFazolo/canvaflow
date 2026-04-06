import { initWebviewDragPreload } from '../../../shared/preload/createWebviewDragPreload'

function extractPageId(href: string): string | null {
  const lastSegment = href.split('/').pop()?.split('?')[0] ?? ''
  const hexMatch = lastSegment.match(/([0-9a-f]{32})$/i)
  if (hexMatch) return hexMatch[1]
  const uuidMatch = href.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  if (uuidMatch) return uuidMatch[1].replace(/-/g, '')
  return null
}

initWebviewDragPreload({
  channelPrefix: 'notion',
  extractItemId: extractPageId,
  extractTitle: (el) => {
    const card = el.closest('[data-block-id]') ?? el.closest('a') ?? el
    const text = (card as HTMLElement).innerText ?? ''
    return text.split('\n')[0].trim() || 'Untitled'
  },
  linkSelector: 'a[href]',
  cardContainerSelector: '[data-block-id]',
  overlayBackground: 'rgba(167, 139, 250, 0.07)',
  overlayBorderColor: 'rgba(167, 139, 250, 0.35)',
  badgeBackground: 'rgba(124, 58, 237, 0.92)',
  hoverHighlightCSS: `
    a[href*="notion.so"]:hover,
    [data-block-id] a[href]:hover {
      outline: 2px solid rgba(167, 139, 250, 0.7) !important;
      outline-offset: 2px !important;
      border-radius: 4px !important;
      cursor: grab !important;
    }
  `,
})
