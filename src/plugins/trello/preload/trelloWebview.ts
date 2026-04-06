import { initWebviewDragPreload } from '../../../shared/preload/createWebviewDragPreload'

function extractCardId(href: string): string | null {
  const match = href.match(/\/c\/([^/?#\s]+)/)
  if (!match) return null
  const candidate = match[1]
  return candidate.length >= 4 ? candidate : null
}

initWebviewDragPreload({
  channelPrefix: 'trello',
  extractItemId: extractCardId,
  extractTitle: (el) => {
    const card = el.closest('a[href*="/c/"]') ?? el
    const text = (card as HTMLElement).innerText ?? ''
    return text.split('\n')[0].trim() || 'Untitled'
  },
  linkSelector: 'a[href*="/c/"]',
  cardContainerSelector: null,
  overlayBackground: 'rgba(0, 121, 191, 0.06)',
  overlayBorderColor: 'rgba(0, 121, 191, 0.3)',
  badgeBackground: 'rgba(0, 82, 204, 0.92)',
  hoverHighlightCSS: `
    a[href*="/c/"]:hover {
      outline: 2px solid rgba(0, 121, 191, 0.7) !important;
      outline-offset: 2px !important;
      border-radius: 4px !important;
      cursor: grab !important;
    }
  `,
})
