/**
 * Maestro Hand-gestures — navigation enhancement plugin.
 *
 * Layers hand gesture input on top of existing navigation modes using
 * MediaPipe Hand Landmarker + webcam. Does NOT replace mouse/keyboard —
 * runs alongside them.
 *
 * Gestures:
 *   Open palm movement  →  pan canvas
 *   Pinch (thumb+index) →  zoom canvas
 *
 * Activated via Settings > Enhancements > Maestro Hand-gestures toggle.
 * Controlled by settings.maestroEnabled (boolean).
 */
export const maestroPlugin = {
  id: 'maestro',
  label: 'Maestro Hand-gestures',
  description: 'Control the canvas with hand gestures via webcam. Open palm to pan, pinch to zoom.',
  settingsKey: 'maestroEnabled' as const,
}
