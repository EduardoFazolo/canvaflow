/**
 * Pure gesture detection utilities for Maestro Hand-gestures.
 * No side effects — all functions take landmarks and return values.
 *
 * MediaPipe Hand Landmark indices (0-20):
 *   https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
 *
 * Normalized coords: x/y in [0,1], origin top-left of video frame.
 * y increases downward, so fingertips pointing up → tip.y < mcp.y.
 */

export const WRIST      = 0
export const THUMB_TIP  = 4
export const INDEX_MCP  = 5
export const INDEX_TIP  = 8
export const MIDDLE_MCP = 9
export const MIDDLE_TIP = 12
export const RING_MCP   = 13
export const RING_TIP   = 16
export const PINKY_MCP  = 17
export const PINKY_TIP  = 20

export interface Landmark {
  x: number
  y: number
  z: number
}

/** Euclidean distance between two landmarks in normalized [0,1] space. */
export function landmarkDist(a: Landmark, b: Landmark): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

/**
 * Palm centroid: average of wrist + all four MCP joints.
 * More stable than wrist alone for tracking hand movement.
 */
export function palmCentroid(lm: Landmark[]): { x: number; y: number } {
  const pts = [lm[WRIST], lm[INDEX_MCP], lm[MIDDLE_MCP], lm[RING_MCP], lm[PINKY_MCP]]
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  }
}

/**
 * Open palm: all four fingertips are above (lower y) their MCP joints.
 * Used to trigger pan mode.
 */
export function isOpenPalm(lm: Landmark[]): boolean {
  return (
    lm[INDEX_TIP].y  < lm[INDEX_MCP].y  &&
    lm[MIDDLE_TIP].y < lm[MIDDLE_MCP].y &&
    lm[RING_TIP].y   < lm[RING_MCP].y   &&
    lm[PINKY_TIP].y  < lm[PINKY_MCP].y
  )
}

/**
 * Distance between two hands, measured between their palm centroids.
 * Used for two-hand zoom: spread = zoom in, bring together = zoom out.
 * Returns a value in normalized [0,1] space (typically 0.1–0.9).
 */
export function twoHandDistance(lm1: Landmark[], lm2: Landmark[]): number {
  const c1 = palmCentroid(lm1)
  const c2 = palmCentroid(lm2)
  return Math.sqrt((c1.x - c2.x) ** 2 + (c1.y - c2.y) ** 2)
}

// --- Tuning constants ---

/**
 * Multiplier converting normalized palm delta → screen pixels.
 * Normalized coords are [0,1] relative to video frame width/height.
 * A sensitivity of 2.5 means moving hand halfway across frame = pans 1.25× screen width.
 */
export const PAN_SENSITIVITY = 2.5
/**
 * Minimum hand movement (normalized) before panning starts.
 * Prevents micro-jitter from triggering canvas movement while hand is resting.
 */
export const PAN_DEADZONE    = 0.018
