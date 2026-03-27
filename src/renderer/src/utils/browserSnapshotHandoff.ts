export type BrowserHandoffState = 'live' | 'freezing' | 'frozen'

export interface BrowserSnapshotHandoff {
  handoffState: BrowserHandoffState
  screenshot: string | null
  screenshotVisible: boolean
  nextFreezeRequestId: number
  activeFreezeRequestId: number | null
  screenshotStale: boolean
}

export interface BrowserFreezeTransition {
  next: BrowserSnapshotHandoff
  requestId: number | null
  shouldCaptureAndHide: boolean
}

export interface BrowserFreezeResult {
  dataUrl: string | null
  didHide: boolean
}

export function createBrowserSnapshotHandoff(): BrowserSnapshotHandoff {
  return {
    handoffState: 'live',
    screenshot: null,
    screenshotVisible: false,
    nextFreezeRequestId: 1,
    activeFreezeRequestId: null,
    screenshotStale: false,
  }
}

export function setBrowserSnapshot(
  handoff: BrowserSnapshotHandoff,
  screenshot: string | null
): BrowserSnapshotHandoff {
  return { ...handoff, screenshot }
}

export function beginBrowserFreeze(handoff: BrowserSnapshotHandoff): BrowserFreezeTransition {
  if (handoff.handoffState !== 'live' || !handoff.screenshot) {
    return {
      next: handoff,
      requestId: null,
      shouldCaptureAndHide: false,
    }
  }

  const requestId = handoff.nextFreezeRequestId
  return {
    next: {
      ...handoff,
      handoffState: 'freezing',
      screenshotVisible: true,
      activeFreezeRequestId: requestId,
      nextFreezeRequestId: requestId + 1,
    },
    requestId,
    shouldCaptureAndHide: true,
  }
}

export function resolveBrowserFreeze(
  handoff: BrowserSnapshotHandoff,
  requestId: number,
  result: BrowserFreezeResult
): BrowserSnapshotHandoff {
  if (handoff.activeFreezeRequestId !== requestId) return handoff

  if (!result.didHide) {
    return {
      ...handoff,
      handoffState: 'live',
      activeFreezeRequestId: null,
      screenshotVisible: Boolean(handoff.screenshot),
    }
  }

  const screenshot = handoff.screenshotStale && result.dataUrl ? result.dataUrl : handoff.screenshot
  return {
    ...handoff,
    handoffState: 'frozen',
    activeFreezeRequestId: null,
    screenshot,
    screenshotVisible: Boolean(screenshot),
    screenshotStale: false,
  }
}

export function showBrowserLive(handoff: BrowserSnapshotHandoff): BrowserSnapshotHandoff {
  return {
    ...handoff,
    handoffState: 'live',
    activeFreezeRequestId: null,
    screenshotStale: true,
  }
}

export function hideBrowserScreenshot(handoff: BrowserSnapshotHandoff): BrowserSnapshotHandoff {
  return {
    ...handoff,
    screenshotVisible: false,
  }
}
