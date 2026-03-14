import AppKit
import QuartzCore

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

final class WorkflowState {
    let id: UUID
    let accent: NSColor
    var name: String
    var camera: CameraState
    var tiles: [TileState]
    var focusedTileID: UUID?
    var hasSpawnedInitialTerminal: Bool

    init(
        id: UUID = UUID(),
        name: String,
        accent: NSColor,
        camera: CameraState = CameraState(),
        tiles: [TileState] = [],
        focusedTileID: UUID? = nil,
        hasSpawnedInitialTerminal: Bool = false
    ) {
        self.id = id
        self.name = name
        self.accent = accent
        self.camera = camera
        self.tiles = tiles
        self.focusedTileID = focusedTileID
        self.hasSpawnedInitialTerminal = hasSpawnedInitialTerminal
    }
}

struct WorkflowSummary {
    let id: UUID
    let name: String
    let terminalCount: Int
    let accent: NSColor
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
    static let sidebar = NSColor(deviceRed: 0.082, green: 0.083, blue: 0.090, alpha: 1.0)
    static let sidebarElevated = NSColor(deviceRed: 0.098, green: 0.100, blue: 0.109, alpha: 1.0)
    static let sidebarSelection = NSColor(deviceRed: 0.146, green: 0.152, blue: 0.170, alpha: 0.92)
    static let sidebarSelectionBorder = NSColor(deviceRed: 0.254, green: 0.287, blue: 0.352, alpha: 1.0)
    static let sidebarHover = NSColor(deviceRed: 0.131, green: 0.136, blue: 0.150, alpha: 0.68)
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
    static let amber = NSColor(deviceRed: 0.812, green: 0.647, blue: 0.306, alpha: 1.0)
    static let coral = NSColor(deviceRed: 0.851, green: 0.439, blue: 0.416, alpha: 1.0)
    static let plum = NSColor(deviceRed: 0.631, green: 0.486, blue: 0.792, alpha: 1.0)

    static let workflowAccents: [NSColor] = [emerald, cyan, amber, coral, plum]

    static func workflowAccent(at index: Int) -> NSColor {
        workflowAccents[index % workflowAccents.count]
    }
}

enum CanvasTypography {
    static func displayFont(size: CGFloat) -> NSFont {
        NSFont(name: "AvenirNext-DemiBold", size: size) ?? NSFont.systemFont(ofSize: size, weight: .semibold)
    }

    static func bodyFont(size: CGFloat, weight: NSFont.Weight = .medium) -> NSFont {
        if weight >= .semibold {
            return NSFont(name: "AvenirNext-DemiBold", size: size) ?? NSFont.systemFont(ofSize: size, weight: weight)
        }

        return NSFont(name: "AvenirNext-Medium", size: size) ?? NSFont.systemFont(ofSize: size, weight: weight)
    }
}

enum CanvasMetrics {
    static let sidebarWidth: CGFloat = 300
    static let collapsedSidebarWidth: CGFloat = 72
    static let inset: CGFloat = 20
    static let compactInset: CGFloat = 12
    static let sidebarTopInset: CGFloat = 34
    static let controlGap: CGFloat = 12
    static let sectionGap: CGFloat = 20
    static let rowGap: CGFloat = 10
    static let controlHeight: CGFloat = 30
    static let compactControlHeight: CGFloat = 28
    static let badgeMinWidth: CGFloat = 28
    static let badgeHorizontalPadding: CGFloat = 9
    static let badgeHeight: CGFloat = 20
    static let rowHeight: CGFloat = 60
    static let compactRowHeight: CGFloat = 44
    static let controlRadius: CGFloat = 8
    static let cardRadius: CGFloat = 14
    static let cardInsetX: CGFloat = 24
    static let cardInsetY: CGFloat = 20
    static let canvasInset: CGFloat = 22
    static let sidebarAnimationDuration: TimeInterval = 0.26
    static let sidebarAnimationTiming = CAMediaTimingFunction(name: .easeInEaseOut)
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
