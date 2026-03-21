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

/**
 * Domain Expansion gesture: fingertips of both hands meet at the top while
 * wrists/palms are spread apart — forming an "A" / triangle shape.
 * (Opposite of prayer: palms apart, fingertips touching.)
 * Held for DOMAIN_HOLD_DURATION ms → toggles Maestro sleep/wake.
 *
 * Detection:
 *  - Index fingertips of both hands are close (tips touching at top)
 *  - Palm centroids are spread apart (wrists wide)
 *  - Index fingers pointing upward on both hands
 */
export const DOMAIN_TIP_THRESHOLD  = 0.10  // max normalized dist between index tips
export const DOMAIN_PALM_MIN       = 0.18  // min palm centroid dist (hands must be spread)

export function isDomainExpansion(lm1: Landmark[], lm2: Landmark[]): boolean {
  // Both index AND middle fingertips must be close — requires actual hand contact
  if (landmarkDist(lm1[INDEX_TIP],  lm2[INDEX_TIP])  > DOMAIN_TIP_THRESHOLD) return false
  if (landmarkDist(lm1[MIDDLE_TIP], lm2[MIDDLE_TIP]) > DOMAIN_TIP_THRESHOLD) return false
  // Palms must be spread apart (forming the triangle base)
  if (twoHandDistance(lm1, lm2) < DOMAIN_PALM_MIN) return false
  // Index fingers pointing upward on both hands
  return lm1[INDEX_TIP].y < lm1[INDEX_MCP].y && lm2[INDEX_TIP].y < lm2[INDEX_MCP].y
}

/**
 * Returns true when the two hands' index fingertips are close enough
 * to be considered "touching" — used to block zoom from firing during
 * domain expansion approach.
 */
export function areFingertipsTouching(lm1: Landmark[], lm2: Landmark[]): boolean {
  return landmarkDist(lm1[INDEX_TIP], lm2[INDEX_TIP]) < DOMAIN_TIP_THRESHOLD * 1.4
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
