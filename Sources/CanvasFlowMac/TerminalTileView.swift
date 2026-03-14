import AppKit
import SwiftTerm

final class TerminalTileView: NSView, LocalProcessTerminalViewDelegate {
    let tileID: UUID
    let accent: NSColor
    let workingDirectory: String
    let initialCommand: String?

    var onRequestFocus: ((UUID) -> Void)?
    var onDragStart: ((UUID, CGPoint) -> Void)?
    var onDragMove: ((UUID, CGPoint) -> Void)?
    var onDragEnd: ((UUID) -> Void)?
    var onResizeStart: ((UUID, ResizeHandle, CGPoint) -> Void)?
    var onResizeMove: ((UUID, ResizeHandle, CGPoint) -> Void)?
    var onResizeEnd: ((UUID, ResizeHandle) -> Void)?
    var onTitleChanged: ((UUID, String) -> Void)?
    var onRequestClose: ((UUID) -> Void)?

    var terminalResponder: NSResponder {
        terminalView
    }

    private let titleBarView = TileHeaderView(frame: .zero)
    private let bodyContainer = NSView(frame: .zero)
    private let terminalView = LocalProcessTerminalView(frame: .zero)
    private let leftHandle = ResizeHandleView(handle: .left)
    private let rightHandle = ResizeHandleView(handle: .right)
    private let topHandle = ResizeHandleView(handle: .top)
    private let bottomHandle = ResizeHandleView(handle: .bottom)
    private let topLeftHandle = ResizeHandleView(handle: .topLeft)
    private let topRightHandle = ResizeHandleView(handle: .topRight)
    private let bottomLeftHandle = ResizeHandleView(handle: .bottomLeft)
    private let bottomRightHandle = ResizeHandleView(handle: .bottomRight)

    private let baseFontSize: CGFloat = 13
    private var currentTitle: String
    private var hasExited = false

    init(id: UUID, accent: NSColor, workingDirectory: String, initialCommand: String? = nil, initialTitle: String = "Terminal") {
        self.tileID = id
        self.accent = accent
        self.workingDirectory = workingDirectory
        self.initialCommand = initialCommand
        self.currentTitle = initialTitle
        super.init(frame: .zero)
        setup()
        startShell()
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override var isFlipped: Bool {
        true
    }

    override func layout() {
        super.layout()

        let titleHeight = min(max(34, bounds.height * 0.12), 44)
        let edgeThickness: CGFloat = 8
        let cornerSize: CGFloat = 16

        titleBarView.frame = CGRect(x: 0, y: 0, width: bounds.width, height: titleHeight)
        bodyContainer.frame = CGRect(
            x: 12,
            y: titleHeight + 12,
            width: max(40, bounds.width - 24),
            height: max(40, bounds.height - titleHeight - 24)
        )
        terminalView.frame = bodyContainer.bounds.insetBy(dx: 8, dy: 8)

        leftHandle.frame = CGRect(x: 0, y: cornerSize, width: edgeThickness, height: max(20, bounds.height - (cornerSize * 2)))
        rightHandle.frame = CGRect(x: bounds.width - edgeThickness, y: cornerSize, width: edgeThickness, height: max(20, bounds.height - (cornerSize * 2)))
        topHandle.frame = CGRect(x: cornerSize, y: 0, width: max(20, bounds.width - (cornerSize * 2)), height: edgeThickness)
        bottomHandle.frame = CGRect(x: cornerSize, y: bounds.height - edgeThickness, width: max(20, bounds.width - (cornerSize * 2)), height: edgeThickness)

        topLeftHandle.frame = CGRect(x: 0, y: 0, width: cornerSize, height: cornerSize)
        topRightHandle.frame = CGRect(x: bounds.width - cornerSize, y: 0, width: cornerSize, height: cornerSize)
        bottomLeftHandle.frame = CGRect(x: 0, y: bounds.height - cornerSize, width: cornerSize, height: cornerSize)
        bottomRightHandle.frame = CGRect(x: bounds.width - cornerSize, y: bounds.height - cornerSize, width: cornerSize, height: cornerSize)

        titleBarView.needsDisplay = true
    }

    override func menu(for event: NSEvent) -> NSMenu? {
        onRequestFocus?(tileID)
        let menu = NSMenu(title: "Tile")
        let closeItem = NSMenuItem(title: "Close Tile", action: #selector(closeTile), keyEquivalent: "")
        closeItem.target = self
        menu.addItem(closeItem)
        return menu
    }

    @objc
    private func closeTile() {
        onRequestClose?(tileID)
    }

    @objc
    private func terminalInteracted() {
        onRequestFocus?(tileID)
        window?.makeFirstResponder(terminalView)
    }

    func applyScale(_ zoom: CGFloat, focused: Bool) {
        let clampedZoom = zoom.clamped(to: 0.72...1.45)
        let fontSize = (baseFontSize * clampedZoom).clamped(to: 10...18)

        wantsLayer = true
        layer?.backgroundColor = CanvasTheme.tileFill.cgColor
        layer?.cornerRadius = max(10, 14 * zoom)
        layer?.borderWidth = focused ? 1.2 : 1.0
        layer?.borderColor = (focused ? CanvasTheme.tileStrokeFocused : CanvasTheme.tileStroke).cgColor
        layer?.shadowColor = NSColor.black.withAlphaComponent(focused ? 0.10 : 0.04).cgColor
        layer?.shadowOpacity = 1
        layer?.shadowRadius = focused ? 6 * zoom : 3 * zoom
        layer?.shadowOffset = CGSize(width: 0, height: 1 * zoom)

        bodyContainer.wantsLayer = true
        bodyContainer.layer?.backgroundColor = CanvasTheme.tileShell.cgColor
        bodyContainer.layer?.cornerRadius = max(8, 10 * zoom)
        bodyContainer.layer?.masksToBounds = true
        bodyContainer.layer?.borderWidth = 1
        bodyContainer.layer?.borderColor = CanvasTheme.border.cgColor

        titleBarView.focused = focused
        titleBarView.accent = accent
        titleBarView.title = currentTitle
        titleBarView.badge = hasExited ? "EXIT" : (focused ? "LIVE" : "TTY")
        titleBarView.badgeColor = hasExited ? CanvasTheme.mutedText : (focused ? accent.withAlphaComponent(0.92) : CanvasTheme.mutedText)
        titleBarView.zoom = zoom

        terminalView.font = NSFont.monospacedSystemFont(ofSize: fontSize, weight: .regular)

        needsLayout = true
        needsDisplay = true
    }

    func shutdown() {
        terminalView.terminate()
    }

    func sizeChanged(source: LocalProcessTerminalView, newCols: Int, newRows: Int) {
    }

    func setTerminalTitle(source: LocalProcessTerminalView, title: String) {
        let nextTitle = title.isEmpty ? "Terminal" : title
        currentTitle = nextTitle
        titleBarView.title = nextTitle
        onTitleChanged?(tileID, nextTitle)
    }

    func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {
    }

    func processTerminated(source: TerminalView, exitCode: Int32?) {
        hasExited = true
        titleBarView.badge = "EXIT"
        titleBarView.badgeColor = CanvasTheme.mutedText
    }

    private func setup() {
        terminalView.processDelegate = self
        terminalView.nativeBackgroundColor = CanvasTheme.tileShell
        terminalView.nativeForegroundColor = CanvasTheme.bodyText
        terminalView.caretColor = accent
        terminalView.allowMouseReporting = true
        terminalView.optionAsMetaKey = true
        terminalView.disableFullRedrawOnAnyChanges = true
        terminalView.caretViewTracksFocus = true
        terminalView.getTerminal().setCursorStyle(.steadyBlock)

        let leftClick = NSClickGestureRecognizer(target: self, action: #selector(terminalInteracted))
        leftClick.buttonMask = 0x1
        terminalView.addGestureRecognizer(leftClick)

        let rightClick = NSClickGestureRecognizer(target: self, action: #selector(terminalInteracted))
        rightClick.buttonMask = 0x2
        terminalView.addGestureRecognizer(rightClick)

        titleBarView.onMouseDown = { [weak self] point in
            guard let self else { return }
            self.onRequestFocus?(self.tileID)
            self.onDragStart?(self.tileID, point)
        }
        titleBarView.onMouseDragged = { [weak self] point in
            guard let self else { return }
            self.onDragMove?(self.tileID, point)
        }
        titleBarView.onMouseUp = { [weak self] in
            guard let self else { return }
            self.onDragEnd?(self.tileID)
        }

        let resizeHandles = [
            leftHandle,
            rightHandle,
            topHandle,
            bottomHandle,
            topLeftHandle,
            topRightHandle,
            bottomLeftHandle,
            bottomRightHandle,
        ]

        for handleView in resizeHandles {
            handleView.onMouseDown = { [weak self] handle, point in
                guard let self else { return }
                self.onRequestFocus?(self.tileID)
                self.onResizeStart?(self.tileID, handle, point)
            }
            handleView.onMouseDragged = { [weak self] handle, point in
                guard let self else { return }
                self.onResizeMove?(self.tileID, handle, point)
            }
            handleView.onMouseUp = { [weak self] handle in
                guard let self else { return }
                self.onResizeEnd?(self.tileID, handle)
            }
        }

        titleBarView.title = currentTitle
        titleBarView.badge = "LIVE"
        titleBarView.badgeColor = accent.withAlphaComponent(0.92)

        addSubview(titleBarView)
        addSubview(bodyContainer)
        bodyContainer.addSubview(terminalView)
        for handleView in resizeHandles {
            addSubview(handleView)
        }

        applyScale(1.0, focused: false)
    }

    private func startShell() {
        let shell = ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
        let shellIdiom = "-" + URL(fileURLWithPath: shell).lastPathComponent
        terminalView.startProcess(executable: shell, args: [], environment: nil, execName: shellIdiom, currentDirectory: workingDirectory)

        guard let initialCommand else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) { [weak self] in
            self?.terminalView.send(txt: initialCommand + "\n")
        }
    }
}

private final class TileHeaderView: NSView {
    var onMouseDown: ((CGPoint) -> Void)?
    var onMouseDragged: ((CGPoint) -> Void)?
    var onMouseUp: (() -> Void)?
    var focused = false
    var accent = CanvasTheme.cyan
    var title = "Terminal"
    var badge = "LIVE"
    var badgeColor = CanvasTheme.mutedText
    var zoom: CGFloat = 1.0

    override var isFlipped: Bool {
        true
    }

    override func draw(_ dirtyRect: NSRect) {
        let fillColor = focused ? CanvasTheme.tileHeaderFocused : CanvasTheme.tileHeader
        fillColor.setFill()
        bounds.fill()

        let divider = NSBezierPath()
        divider.move(to: CGPoint(x: 1, y: bounds.maxY - 0.5))
        divider.line(to: CGPoint(x: bounds.maxX - 1, y: bounds.maxY - 0.5))
        CanvasTheme.border.setStroke()
        divider.lineWidth = 1
        divider.stroke()

        accent.withAlphaComponent(focused ? 0.9 : 0.6).setFill()
        NSBezierPath(roundedRect: CGRect(x: 16, y: (bounds.height - 6) / 2, width: 6, height: 6), xRadius: 2, yRadius: 2).fill()

        let titleAttributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: max(11, 12 * zoom), weight: .semibold),
            .foregroundColor: CanvasTheme.titleText,
        ]
        let badgeAttributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: max(9, 9.5 * zoom), weight: .regular),
            .foregroundColor: badgeColor,
        ]

        title.draw(
            in: CGRect(x: 34, y: (bounds.height - 18) / 2 - 0.5, width: max(80, bounds.width - 140), height: 18),
            withAttributes: titleAttributes
        )

        let badgeSize = badge.size(withAttributes: badgeAttributes)
        badge.draw(
            in: CGRect(x: bounds.width - badgeSize.width - 20, y: (bounds.height - badgeSize.height) / 2, width: badgeSize.width, height: badgeSize.height),
            withAttributes: badgeAttributes
        )
    }

    override func mouseDown(with event: NSEvent) {
        onMouseDown?(event.locationInWindow)
    }

    override func mouseDragged(with event: NSEvent) {
        onMouseDragged?(event.locationInWindow)
    }

    override func mouseUp(with event: NSEvent) {
        onMouseUp?()
    }
}

private final class ResizeHandleView: NSView {
    let handle: ResizeHandle

    var onMouseDown: ((ResizeHandle, CGPoint) -> Void)?
    var onMouseDragged: ((ResizeHandle, CGPoint) -> Void)?
    var onMouseUp: ((ResizeHandle) -> Void)?

    init(handle: ResizeHandle) {
        self.handle = handle
        super.init(frame: .zero)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override var isFlipped: Bool {
        true
    }

    override func resetCursorRects() {
        discardCursorRects()

        switch handle {
        case .left, .right:
            addCursorRect(bounds, cursor: .resizeLeftRight)
        case .top, .bottom:
            addCursorRect(bounds, cursor: .resizeUpDown)
        case .topLeft, .bottomRight:
            addCursorRect(bounds, cursor: .crosshair)
        case .topRight, .bottomLeft:
            addCursorRect(bounds, cursor: .crosshair)
        }
    }

    override func mouseDown(with event: NSEvent) {
        onMouseDown?(handle, event.locationInWindow)
    }

    override func mouseDragged(with event: NSEvent) {
        onMouseDragged?(handle, event.locationInWindow)
    }

    override func mouseUp(with event: NSEvent) {
        onMouseUp?(handle)
    }
}
