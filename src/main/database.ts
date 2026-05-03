import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

// ---------------------------------------------------------------------------
// Types (mirrored in renderer via preload)
// ---------------------------------------------------------------------------

export interface WorkspaceRow {
  id: string
  name: string
  path: string
  lastOpenedAt: number
  color: string | null
  description: string | null
  archived: number // 0 | 1
  sortOrder: number
}

export interface NodeRow {
  id: string
  workspaceId: string
  type: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  title: string
  minimized: number // 0 | 1
  contentScale: number
  props: string     // JSON
  createdAt: number
  updatedAt: number
}

export interface CameraRow {
  workspaceId: string
  x: number
  y: number
  zoom: number
}

export interface BrowserSessionRow {
  id: string
  name: string
  createdAt: number
}

export interface NodeMetadataRow {
  nodeId: string
  lastFocusedAt: number
  focusCount: number
  totalFocusDuration: number
  tags: string // JSON array string
  description: string | null
  pinned: number // 0 | 1
  /** Optional role tag for agent nodes (e.g. 'main', 'reviewer'). NULL for non-agents and legacy data. */
  agentRole: string | null
  /** Optional Claude Code session ID — set when the agent reports it via the SessionStart hook. NULL for legacy data. */
  agentSessionId: string | null
}

// ---------------------------------------------------------------------------
// DB instance
// ---------------------------------------------------------------------------

let db: Database.Database

export function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  mkdirSync(userDataPath, { recursive: true })
  const dbPath = join(userDataPath, 'canvaflow.db')

  try {
    db = new Database(dbPath, { verbose: undefined })
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    migrate()
    console.log('[db] Initialized at', dbPath)
  } catch (err) {
    console.error('[db] Failed to initialize database:', err)
    throw err
  }
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function migrate(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      path        TEXT NOT NULL,
      lastOpenedAt INTEGER NOT NULL,
      color       TEXT
    );

    CREATE TABLE IF NOT EXISTS canvas_nodes (
      id          TEXT PRIMARY KEY,
      workspaceId TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,
      x           REAL NOT NULL,
      y           REAL NOT NULL,
      width       REAL NOT NULL,
      height      REAL NOT NULL,
      zIndex      INTEGER NOT NULL,
      title       TEXT NOT NULL,
      minimized   INTEGER NOT NULL DEFAULT 0,
      contentScale REAL NOT NULL DEFAULT 1,
      props       TEXT NOT NULL DEFAULT '{}',
      createdAt   INTEGER NOT NULL,
      updatedAt   INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS canvas_cameras (
      workspaceId TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      x           REAL NOT NULL DEFAULT 0,
      y           REAL NOT NULL DEFAULT 0,
      zoom        REAL NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS app_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_canvas_nodes_workspace ON canvas_nodes(workspaceId);

    CREATE TABLE IF NOT EXISTS node_metadata (
      nodeId       TEXT PRIMARY KEY,
      lastFocusedAt INTEGER NOT NULL DEFAULT 0,
      focusCount   INTEGER NOT NULL DEFAULT 0,
      tags         TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS browser_sessions (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );
  `)

  // Incremental migrations — safe to run on existing databases
  const cols = db.prepare('PRAGMA table_info(canvas_nodes)').all() as { name: string }[]
  if (!cols.some((c) => c.name === 'contentScale')) {
    db.exec('ALTER TABLE canvas_nodes ADD COLUMN contentScale REAL NOT NULL DEFAULT 1')
  }

  // Voice-commands metadata migrations
  const metaCols = db.prepare('PRAGMA table_info(node_metadata)').all() as { name: string }[]
  if (!metaCols.some((c) => c.name === 'totalFocusDuration')) {
    db.exec('ALTER TABLE node_metadata ADD COLUMN totalFocusDuration INTEGER NOT NULL DEFAULT 0')
  }
  if (!metaCols.some((c) => c.name === 'description')) {
    db.exec('ALTER TABLE node_metadata ADD COLUMN description TEXT')
  }
  if (!metaCols.some((c) => c.name === 'pinned')) {
    db.exec('ALTER TABLE node_metadata ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0')
  }
  if (!metaCols.some((c) => c.name === 'agentRole')) {
    db.exec('ALTER TABLE node_metadata ADD COLUMN agentRole TEXT')
  }
  if (!metaCols.some((c) => c.name === 'agentSessionId')) {
    db.exec('ALTER TABLE node_metadata ADD COLUMN agentSessionId TEXT')
  }

  const wsCols = db.prepare('PRAGMA table_info(workspaces)').all() as { name: string }[]
  if (!wsCols.some((c) => c.name === 'description')) {
    db.exec('ALTER TABLE workspaces ADD COLUMN description TEXT')
  }
  if (!wsCols.some((c) => c.name === 'archived')) {
    db.exec('ALTER TABLE workspaces ADD COLUMN archived INTEGER NOT NULL DEFAULT 0')
  }
  if (!wsCols.some((c) => c.name === 'sortOrder')) {
    db.exec('ALTER TABLE workspaces ADD COLUMN sortOrder INTEGER NOT NULL DEFAULT 0')
  }
}

// ---------------------------------------------------------------------------
// Workspace queries
// ---------------------------------------------------------------------------

export function getWorkspaces(): WorkspaceRow[] {
  return db.prepare('SELECT * FROM workspaces ORDER BY lastOpenedAt DESC').all() as WorkspaceRow[]
}

export function saveWorkspace(w: WorkspaceRow): void {
  db.prepare(`
    INSERT INTO workspaces (id, name, path, lastOpenedAt, color, description, archived, sortOrder)
    VALUES (@id, @name, @path, @lastOpenedAt, @color, @description, @archived, @sortOrder)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      path = excluded.path,
      lastOpenedAt = excluded.lastOpenedAt,
      color = excluded.color,
      description = excluded.description,
      archived = excluded.archived,
      sortOrder = excluded.sortOrder
  `).run(w)
}

export function deleteWorkspace(id: string): void {
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id)
}

// ---------------------------------------------------------------------------
// Node queries
// ---------------------------------------------------------------------------

export function getNodes(workspaceId: string): NodeRow[] {
  return db.prepare('SELECT * FROM canvas_nodes WHERE workspaceId = ? ORDER BY zIndex ASC')
    .all(workspaceId) as NodeRow[]
}

export function saveNodes(workspaceId: string, nodes: NodeRow[]): void {
  const upsert = db.prepare(`
    INSERT INTO canvas_nodes
      (id, workspaceId, type, x, y, width, height, zIndex, title, minimized, contentScale, props, createdAt, updatedAt)
    VALUES
      (@id, @workspaceId, @type, @x, @y, @width, @height, @zIndex, @title, @minimized, @contentScale, @props, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      x = excluded.x, y = excluded.y,
      width = excluded.width, height = excluded.height,
      zIndex = excluded.zIndex, title = excluded.title,
      minimized = excluded.minimized, contentScale = excluded.contentScale,
      props = excluded.props, updatedAt = excluded.updatedAt
  `)

  // Delete nodes no longer in the list
  const ids = nodes.map((n) => n.id)
  const existing = db.prepare('SELECT id FROM canvas_nodes WHERE workspaceId = ?').all(workspaceId) as { id: string }[]
  const toDelete = existing.filter((r) => !ids.includes(r.id))
  const del = db.prepare('DELETE FROM canvas_nodes WHERE id = ?')

  const run = db.transaction(() => {
    for (const row of toDelete) del.run(row.id)
    for (const node of nodes) upsert.run(node)
  })
  run()
}

export function deleteNode(id: string): void {
  db.prepare('DELETE FROM canvas_nodes WHERE id = ?').run(id)
}

export function mergeNodeProps(nodeId: string, patch: Record<string, unknown>): void {
  const row = db.prepare('SELECT props FROM canvas_nodes WHERE id = ?').get(nodeId) as { props: string } | null
  if (!row) return
  let current: Record<string, unknown> = {}
  try { current = JSON.parse(row.props) } catch {}
  const merged = JSON.stringify({ ...current, ...patch })
  db.prepare('UPDATE canvas_nodes SET props = ?, updatedAt = ? WHERE id = ?')
    .run(merged, Date.now(), nodeId)
}

// ---------------------------------------------------------------------------
// Browser session queries
// ---------------------------------------------------------------------------

export function getBrowserSessions(): BrowserSessionRow[] {
  return db.prepare('SELECT * FROM browser_sessions ORDER BY createdAt ASC').all() as BrowserSessionRow[]
}

export function saveBrowserSession(s: BrowserSessionRow): void {
  db.prepare(`
    INSERT INTO browser_sessions (id, name, createdAt) VALUES (@id, @name, @createdAt)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name
  `).run(s)
}

export function deleteBrowserSession(id: string): void {
  db.prepare('DELETE FROM browser_sessions WHERE id = ?').run(id)
}

export function getAllNodeIds(): string[] {
  return (db.prepare('SELECT id FROM canvas_nodes').all() as { id: string }[]).map((r) => r.id)
}

// ---------------------------------------------------------------------------
// Camera queries
// ---------------------------------------------------------------------------

export function getCamera(workspaceId: string): CameraRow | null {
  return db.prepare('SELECT * FROM canvas_cameras WHERE workspaceId = ?')
    .get(workspaceId) as CameraRow | null
}

export function saveCamera(cam: CameraRow): void {
  db.prepare(`
    INSERT INTO canvas_cameras (workspaceId, x, y, zoom)
    VALUES (@workspaceId, @x, @y, @zoom)
    ON CONFLICT(workspaceId) DO UPDATE SET x = excluded.x, y = excluded.y, zoom = excluded.zoom
  `).run(cam)
}

// ---------------------------------------------------------------------------
// App state (last active workspace, etc.)
// ---------------------------------------------------------------------------

export function getAppState(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_state WHERE key = ?').get(key) as { value: string } | null
  return row?.value ?? null
}

export function setAppState(key: string, value: string): void {
  db.prepare(`
    INSERT INTO app_state (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

// ---------------------------------------------------------------------------
// Node metadata (focus tracking, tags) — separate from canvas_nodes to avoid
// high-frequency spatial writes touching slower-changing metadata
// ---------------------------------------------------------------------------

export function getNodeMetadata(nodeIds: string[]): NodeMetadataRow[] {
  if (nodeIds.length === 0) return []
  const placeholders = nodeIds.map(() => '?').join(',')
  return db.prepare(`SELECT * FROM node_metadata WHERE nodeId IN (${placeholders})`)
    .all(...nodeIds) as NodeMetadataRow[]
}

export function upsertNodeMetadata(nodeId: string, patch: Partial<Omit<NodeMetadataRow, 'nodeId'>>): void {
  const existing = db.prepare('SELECT * FROM node_metadata WHERE nodeId = ?').get(nodeId) as NodeMetadataRow | null
  const row: NodeMetadataRow = {
    nodeId,
    lastFocusedAt: patch.lastFocusedAt ?? existing?.lastFocusedAt ?? 0,
    focusCount: patch.focusCount ?? existing?.focusCount ?? 0,
    totalFocusDuration: patch.totalFocusDuration ?? existing?.totalFocusDuration ?? 0,
    tags: patch.tags ?? existing?.tags ?? '[]',
    description: patch.description ?? existing?.description ?? null,
    pinned: patch.pinned ?? existing?.pinned ?? 0,
    agentRole: patch.agentRole !== undefined ? patch.agentRole : (existing?.agentRole ?? null),
    agentSessionId: patch.agentSessionId !== undefined ? patch.agentSessionId : (existing?.agentSessionId ?? null),
  }
  db.prepare(`
    INSERT INTO node_metadata (nodeId, lastFocusedAt, focusCount, totalFocusDuration, tags, description, pinned, agentRole, agentSessionId)
    VALUES (@nodeId, @lastFocusedAt, @focusCount, @totalFocusDuration, @tags, @description, @pinned, @agentRole, @agentSessionId)
    ON CONFLICT(nodeId) DO UPDATE SET
      lastFocusedAt = excluded.lastFocusedAt,
      focusCount = excluded.focusCount,
      totalFocusDuration = excluded.totalFocusDuration,
      tags = excluded.tags,
      description = excluded.description,
      pinned = excluded.pinned,
      agentRole = excluded.agentRole,
      agentSessionId = excluded.agentSessionId
  `).run(row)
}
