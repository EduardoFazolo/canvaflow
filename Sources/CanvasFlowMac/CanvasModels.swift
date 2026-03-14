import AppKit

final class TileState {
    let id: UUID
    let accent: NSColor
    let tileView: TerminalTileView
    var worldFrame: CGRect
    var title: String

    init(id: UUID, accent: NSColor, worldFrame: CGRect, title: String, tileView: TerminalTileView) {
        self.id = id
        self.accent = accent
        self.tileView = tileView
        self.worldFrame = worldFrame
        self.title = title
    }
}

struct CameraState {
    var origin: CGPoint = CGPoint(x: -220, y: -180)
    var zoom: CGFloat = 1.0
}

enum InteractionState {
    case idle
    case panning(anchor: CGPoint, initialOrigin: CGPoint)
    case draggingTile(id: UUID, anchor: CGPoint, initialFrame: CGRect)
    case resizingTile(id: UUID, handle: ResizeHandle, anchor: CGPoint, initialFrame: CGRect)
}

enum ResizeHandle {
    case left
    case right
    case top
    case bottom
    case topLeft
    case topRight
    case bottomLeft
    case bottomRight
}

enum CanvasTheme {
    static let background = NSColor(deviceRed: 0.094, green: 0.094, blue: 0.098, alpha: 1.0)
    static let surface = NSColor(deviceRed: 0.112, green: 0.112, blue: 0.118, alpha: 1.0)
    static let surfaceRaised = NSColor(deviceRed: 0.130, green: 0.130, blue: 0.138, alpha: 1.0)
    static let surfaceInset = NSColor(deviceRed: 0.075, green: 0.075, blue: 0.081, alpha: 1.0)
    static let panel = NSColor(deviceRed: 0.102, green: 0.102, blue: 0.108, alpha: 1.0)
    static let gridMinor = NSColor(deviceRed: 0.90, green: 0.92, blue: 0.98, alpha: 0.34)
    static let gridMajor = NSColor(deviceRed: 0.97, green: 0.98, blue: 1.0, alpha: 0.52)
    static let border = NSColor(deviceRed: 0.188, green: 0.188, blue: 0.206, alpha: 1.0)
    static let borderStrong = NSColor(deviceRed: 0.275, green: 0.286, blue: 0.314, alpha: 1.0)
    static let tileShell = NSColor(deviceRed: 0.028, green: 0.028, blue: 0.031, alpha: 1.0)
    static let tileFill = NSColor(deviceRed: 0.054, green: 0.054, blue: 0.059, alpha: 1.0)
    static let tileHeader = NSColor(deviceRed: 0.064, green: 0.064, blue: 0.070, alpha: 1.0)
    static let tileHeaderFocused = NSColor(deviceRed: 0.076, green: 0.076, blue: 0.084, alpha: 1.0)
    static let tileStroke = NSColor(deviceRed: 0.170, green: 0.170, blue: 0.186, alpha: 1.0)
    static let tileStrokeFocused = NSColor(deviceRed: 0.345, green: 0.431, blue: 0.545, alpha: 1.0)
    static let titleText = NSColor(deviceRed: 0.905, green: 0.905, blue: 0.918, alpha: 1.0)
    static let bodyText = NSColor(deviceRed: 0.775, green: 0.775, blue: 0.798, alpha: 1.0)
    static let mutedText = NSColor(deviceRed: 0.505, green: 0.505, blue: 0.535, alpha: 1.0)
    static let emerald = NSColor(deviceRed: 0.376, green: 0.655, blue: 0.541, alpha: 1.0)
    static let cyan = NSColor(deviceRed: 0.424, green: 0.553, blue: 0.741, alpha: 1.0)
}

extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}

extension CGPoint {
    static func + (lhs: CGPoint, rhs: CGPoint) -> CGPoint {
        CGPoint(x: lhs.x + rhs.x, y: lhs.y + rhs.y)
    }

    static func - (lhs: CGPoint, rhs: CGPoint) -> CGPoint {
        CGPoint(x: lhs.x - rhs.x, y: lhs.y - rhs.y)
    }

    static func / (lhs: CGPoint, rhs: CGFloat) -> CGPoint {
        CGPoint(x: lhs.x / rhs, y: lhs.y / rhs)
    }
}

extension CGRect {
    func scaled(from origin: CGPoint, zoom: CGFloat) -> CGRect {
        CGRect(
            x: (minX - origin.x) * zoom,
            y: (minY - origin.y) * zoom,
            width: width * zoom,
            height: height * zoom
        )
    }
}
