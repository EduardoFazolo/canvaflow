export type DetectedAgentStatus = 'idle' | 'done' | 'needs_permission' | 'needs_input'

const ANSI_RE = /\x1b(?:\[[0-9;?]*[a-zA-Z]|\][^\x07]*(?:\x07|\x1b\\)|[()][AB012]|[NOPQRSTUVWXYZ\\^_`]?)/g
const PERMISSION_HEADER_RE = /\bPermission\b/i
const PERMISSION_BODY_RE = /\bCan I\b/i
const PERMISSION_REQUEST_RE = /\brequested permissions?\b/i
const PERMISSION_PROCEED_RE = /\bDo you want to proceed\?\b/i
const PERMISSION_FOOTER_RE = /\b(?:Esc to cancel|Tab to amend|ctrl\+e to explain)\b/i
const NEEDS_INPUT_TITLE_RE = /\b(?:get|request)\s+user\s+input\b/i
const NEEDS_PERMISSION_TITLE_RE = /\b(?:get|request)\s+user\s+permissions?\b/i
const INPUT_BODY_RE = /\b(?:What would you like to work on(?: [^?\n]+)?\?|Type something\.|Chat about this)/i
const SELECT_FOOTER_RE = /\b(?:Enter|↵)\s+to select\b/i
const CLAUDE_READY_FOOTER_RE = /\?\s+for shortcuts\b/i
const CLAUDE_PROMPT_LINE_RE = /^>\s*$/
const SHELL_PROMPT_LINE_RE = /^[^\n]*[%$#] $/

export function sanitizeTerminalOutput(data: string): string {
  return data.replace(ANSI_RE, '').replace(/\r/g, '\n')
}

export function detectAgentStatusFromTerminalBuffer(buffer: string): DetectedAgentStatus | null {
  const trimmed = buffer.replace(/\s+$/, '')

  // Agent is actively working — short-circuit everything else.
  // Old text in scrollback can match needs_input/needs_permission patterns,
  // but "esc to interrupt" at the tail means the agent is running right now.
  if (/\besc to interrupt\s*$/i.test(trimmed)) return null

  const hasSelectFooter = SELECT_FOOTER_RE.test(buffer)
  const hasPermissionPrompt =
    (hasSelectFooter && (PERMISSION_HEADER_RE.test(buffer) || PERMISSION_BODY_RE.test(buffer))) ||
    ((PERMISSION_REQUEST_RE.test(buffer) || PERMISSION_PROCEED_RE.test(buffer)) && PERMISSION_FOOTER_RE.test(buffer))

  if (hasPermissionPrompt) {
    return 'needs_permission'
  }

  if (hasSelectFooter || INPUT_BODY_RE.test(buffer)) {
    return 'needs_input'
  }

  const lines = trimmed.split('\n').filter((line) => line.length > 0)
  const lastLine = lines.at(-1) ?? ''
  const hasClaudePrompt = lines.some((line) => CLAUDE_PROMPT_LINE_RE.test(line))

  if (CLAUDE_READY_FOOTER_RE.test(trimmed) && hasClaudePrompt) {
    return 'done'
  }

  if (lastLine === '>' || SHELL_PROMPT_LINE_RE.test(lastLine)) return 'idle'

  return null
}

export function detectAgentStatusFromTitle(title: string): Exclude<DetectedAgentStatus, 'idle'> | null {
  if (NEEDS_PERMISSION_TITLE_RE.test(title)) return 'needs_permission'
  if (NEEDS_INPUT_TITLE_RE.test(title)) return 'needs_input'
  return null
}
