import { useCameraStore } from '../../../renderer/src/stores/cameraStore'
import { useNodeStore } from '../../../renderer/src/stores/nodeStore'
import { notionChunkToTiptap, unwrapBlockValue } from './notionToTiptap'

export interface NotionCanvasDropPayload {
  partition: string
  pageId: string
  title: string
  pageUrl?: string
}

type NotionPageChunk = Awaited<ReturnType<typeof window.notion.fetchPage>>
type NotionExternalDragExport = Awaited<ReturnType<typeof window.notion.prepareExternalDrag>>

const pagePromiseCache = new Map<string, Promise<NotionPageChunk>>()
const pageValueCache = new Map<string, NotionPageChunk>()

const exportPromiseCache = new Map<string, Promise<NotionExternalDragExport>>()
const exportValueCache = new Map<string, NotionExternalDragExport>()

function pageKey(partition: string, pageId: string): string {
  return `${partition}:${pageId}`
}

export function primeNotionPage(partition: string, pageId: string): Promise<NotionPageChunk> {
  const key = pageKey(partition, pageId)
  const existingValue = pageValueCache.get(key)
  if (existingValue) return Promise.resolve(existingValue)

  const existingPromise = pagePromiseCache.get(key)
  if (existingPromise) return existingPromise

  const promise = window.notion.fetchPage(partition, pageId)
    .then((chunk) => {
      pageValueCache.set(key, chunk)
      return chunk
    })
    .finally(() => {
      pagePromiseCache.delete(key)
    })

  pagePromiseCache.set(key, promise)
  return promise
}

export function getPreparedNotionExternalDrag(partition: string, pageId: string): NotionExternalDragExport | null {
  return exportValueCache.get(pageKey(partition, pageId)) ?? null
}

export function primeNotionExternalDrag(
  partition: string,
  pageId: string,
  title: string,
  pageUrl?: string
): Promise<NotionExternalDragExport> {
  const key = pageKey(partition, pageId)
  const existingValue = exportValueCache.get(key)
  if (existingValue) return Promise.resolve(existingValue)

  const existingPromise = exportPromiseCache.get(key)
  if (existingPromise) return existingPromise

  const promise = window.notion.prepareExternalDrag(partition, pageId, title, pageUrl)
    .then((result) => {
      exportValueCache.set(key, result)
      return result
    })
    .finally(() => {
      exportPromiseCache.delete(key)
    })

  exportPromiseCache.set(key, promise)
  return promise
}

export async function createNotionNoteFromDrop(
  payload: NotionCanvasDropPayload,
  clientX: number,
  clientY: number,
  prefetchedChunk?: NotionPageChunk,
): Promise<void> {
  const canvasEl = document.querySelector('[data-canvas-root]')
  const canvasRect = canvasEl?.getBoundingClientRect()
  if (!canvasRect) return

  const camera = useCameraStore.getState().camera
  const wx = (clientX - canvasRect.left - camera.x) / camera.zoom
  const wy = (clientY - canvasRect.top - camera.y) / camera.zoom

  const newNode = useNodeStore.getState().add('note', wx - 150, wy - 100, {
    content: null,
    showToolbar: false,
  })
  useNodeStore.getState().update(newNode.id, { title: payload.title })

  try {
    const chunk = prefetchedChunk ?? await primeNotionPage(payload.partition, payload.pageId)
    const imageMap: Record<string, string> = {}

    const setContent = (map: Record<string, string>) => {
      const current = useNodeStore.getState().nodes.get(newNode.id)
      if (!current) return
      useNodeStore.getState().update(newNode.id, {
        props: { ...current.props, content: notionChunkToTiptap(payload.pageId, chunk.recordMap.block, map) },
      })
    }

    setContent(imageMap)

    const imageBlocks = Object.values(chunk.recordMap.block)
      .map((b: any) => unwrapBlockValue(b))
      .filter((v: any) => v?.type === 'image')
      .map((v: any) => ({
        blockId: v.id as string,
        src: (v.format?.display_source ?? v.properties?.source?.[0]?.[0]) as string,
      }))
      .filter((item): item is { blockId: string; src: string } => typeof item.src === 'string')

    await Promise.all(imageBlocks.map(async ({ blockId, src }) => {
      try {
        const dataUrl = await window.notion.fetchImage(payload.partition, src, blockId)
        imageMap[src] = dataUrl
        setContent({ ...imageMap })
      } catch (err) {
        console.error('[createNotionNoteFromDrop] fetchImage failed for', src, err)
      }
    }))
  } catch (err) {
    console.error('Failed to create Notion note from drop:', err)
  }
}
