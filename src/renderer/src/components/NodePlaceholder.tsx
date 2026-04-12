import React from 'react'

const icons: Record<string, React.ReactElement> = {
  terminal: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  browser: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <line x1="2" y1="9" x2="22" y2="9" />
      <circle cx="7" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="6" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  notion: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="7" y1="9" x2="17" y2="9" />
      <line x1="7" y1="13" x2="14" y2="13" />
    </svg>
  ),
  trello: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="9" height="13" rx="2" />
      <rect x="13" y="3" width="9" height="9" rx="2" />
    </svg>
  ),
  claude: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  ),
  codex: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M9 9h.01M15 9h.01M8 14c1.2 1.33 2.67 2 4 2s2.8-.67 4-2" />
    </svg>
  ),
}

interface Props {
  icon: keyof typeof icons
}

export function NodePlaceholder({ icon }: Props): React.ReactElement {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        background: '#0d0d0d',
        color: 'rgba(255,255,255,0.12)',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {icons[icon]}
      <span style={{ fontSize: 11, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.1)' }}>
        Click to start
      </span>
    </div>
  )
}

/**
 * Wraps activated content with a smooth fade-in over the placeholder.
 * The placeholder stays underneath; the real content fades in on top.
 * Once the transition completes, the placeholder unmounts.
 */
export function ActivationFade({
  isActivated,
  icon,
  children,
}: {
  isActivated: boolean
  icon: keyof typeof icons
  children: React.ReactNode
}): React.ReactElement {
  const [showPlaceholder, setShowPlaceholder] = React.useState(!isActivated)
  const [opacity, setOpacity] = React.useState(isActivated ? 1 : 0)

  React.useEffect(() => {
    if (isActivated) {
      // Trigger fade-in on next frame so the transition kicks in
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setOpacity(1)
        })
      })
      // Remove placeholder after transition
      const timer = setTimeout(() => setShowPlaceholder(false), 500)
      return () => clearTimeout(timer)
    }
  }, [isActivated])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {showPlaceholder && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <NodePlaceholder icon={icon} />
        </div>
      )}
      {isActivated && (
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            zIndex: 1,
            opacity,
            transition: 'opacity 0.4s ease-out',
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
