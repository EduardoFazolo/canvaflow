import React, { useEffect, useState, useCallback } from 'react'

interface ExternalPluginInfo {
  id: string
  name: string
  version: string
  author?: string
  description?: string
  nodeType: string
  enabled: boolean
  error?: string
  path: string
}

export function PluginManager(): React.ReactElement {
  const [plugins, setPlugins] = useState<ExternalPluginInfo[]>([])
  const [pluginsDir, setPluginsDir] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const all = await (window as any).plugins.getAll()
      setPlugins(all)
    } catch {
      setPlugins([])
    }
    try {
      const dir = await (window as any).plugins.getDir()
      setPluginsDir(dir)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const toggleEnabled = async (id: string, enabled: boolean) => {
    try {
      await (window as any).plugins.setEnabled(id, enabled)
      await refresh()
    } catch (err) {
      console.error('Failed to toggle plugin:', err)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
        Loading plugins…
      </div>
    )
  }

  return (
    <div>
      {plugins.length === 0 ? (
        <div style={{ padding: '16px', fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
          <div>No external plugins installed.</div>
          <div style={{ marginTop: 8 }}>
            To install a plugin, add its folder to:
          </div>
          <div style={{
            marginTop: 4,
            padding: '6px 10px',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 4,
            fontFamily: 'monospace',
            fontSize: 11,
            color: 'rgba(255,255,255,0.5)',
            userSelect: 'all',
          }}>
            {pluginsDir}
          </div>
        </div>
      ) : (
        plugins.map((p) => (
          <div
            key={p.id}
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>
                  {p.name}
                </span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace' }}>
                  v{p.version}
                </span>
              </div>
              {p.description && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                  {p.description}
                </div>
              )}
              {p.author && (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', marginTop: 2 }}>
                  by {p.author}
                </div>
              )}
              {p.error && (
                <div style={{
                  fontSize: 10, color: '#f87171', marginTop: 4,
                  padding: '4px 8px', background: 'rgba(248,113,113,0.08)',
                  borderRadius: 4, fontFamily: 'monospace',
                }}>
                  {p.error}
                </div>
              )}
            </div>
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Toggle
                value={p.enabled}
                onChange={(v) => toggleEnabled(p.id, v)}
              />
            </div>
          </div>
        ))
      )}
      <div style={{
        padding: '10px 16px', fontSize: 10,
        color: 'rgba(255,255,255,0.15)',
      }}>
        Changes take effect after restarting the app
      </div>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }): React.ReactElement {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        position: 'relative',
        width: 36, height: 20,
        borderRadius: 10, border: 'none',
        background: value ? 'rgba(167,139,250,0.8)' : 'rgba(255,255,255,0.1)',
        cursor: 'pointer', padding: 0,
        transition: 'background 0.15s',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2,
        left: value ? 18 : 2,
        width: 16, height: 16,
        borderRadius: '50%', background: '#fff',
        transition: 'left 0.15s', display: 'block',
      }} />
    </button>
  )
}
