import AppKit

final class CanvasView: NSView {
    private let minimumTileSize = CGSize(width: 320, height: 220)
    private var camera = CameraState()
    private var interaction: InteractionState = .idle
    private var tiles: [TileState] = []
    private var focusedTileID: UUID?
    private var pendingSpawnWorldPoint: CGPoint = .zero
    private var hasSpawnedInitialTerminal = false
    private var scrollMonitor: Any?
    private var magnifyMonitor: Any?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.contentsScale = NSScreen.main?.backingScaleFactor ?? 2.0
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        if let scrollMonitor {
            NSEvent.removeMonitor(scrollMonitor)
        }
        if let magnifyMonitor {
            NSEvent.removeMonitor(magnifyMonitor)
        }
    }

    override var isFlipped: Bool {
        true
    }

    override var acceptsFirstResponder: Bool {
        true
    }

    func spawnInitialTerminalIfNeeded() {
        guard !hasSpawnedInitialTerminal else { return }
        hasSpawnedInitialTerminal = true

        let center = CGPoint(
            x: camera.origin.x + bounds.width / (2 * camera.zoom),
            y: camera.origin.y + bounds.height / (2 * camera.zoom)
        )
        createTerminal(at: center)
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        window?.makeFirstResponder(self)
        installEventMonitorsIfNeeded()
    }

    override func menu(for event: NSEvent) -> NSMenu? {
        let point = convert(event.locationInWindow, from: nil)
        guard tileID(at: point) == nil else { return nil }

        pendingSpawnWorldPoint = viewToWorld(point)

        let menu = NSMenu(title: "Canvas")
        let newTerminal = NSMenuItem(title: "New Terminal", action: #selector(createTerminalFromMenu(_:)), keyEquivalent: "")
        newTerminal.target = self
        menu.addItem(newTerminal)
        return menu
    }

    @objc
    private func createTerminalFromMenu(_ sender: Any?) {
        createTerminal(at: pendingSpawnWorldPoint)
    }

    override func draw(_ dirtyRect: NSRect) {
        drawBackground(in: bounds)
        drawGrid(in: dirtyRect)
        drawOverlay()
    }

    override func mouseDown(with event: NSEvent) {
        window?.makeFirstResponder(self)

        let point = convert(event.locationInWindow, from: nil)
        guard tileID(at: point) == nil else { return }

        focusedTileID = nil
        updateTilePresentation()
        interaction = .panning(anchor: point, initialOrigin: camera.origin)
        needsDisplay = true
    }

    override func mouseDragged(with event: NSEvent) {
        let point = convert(event.locationInWindow, from: nil)

        switch interaction {
        case let .panning(anchor, initialOrigin):
            let delta = (point - anchor) / camera.zoom
            camera.origin = initialOrigin - delta
            relayoutTiles()
            needsDisplay = true

        case let .draggingTile(id, anchor, initialFrame):
            let delta = (point - anchor) / camera.zoom
            updateTile(id: id) { tile in
                tile.worldFrame.origin = initialFrame.origin + delta
            }
            relayoutTiles()
            needsDisplay = true

        case let .resizingTile(id, handle, anchor, initialFrame):
            let delta = (point - anchor) / camera.zoom
            updateTile(id: id) { tile in
                tile.worldFrame = resizedFrame(from: initialFrame, using: handle, delta: delta)
            }
            relayoutTiles()
            needsDisplay = true

        case .idle:
            break
        }
    }

    override func mouseUp(with event: NSEvent) {
        interaction = .idle
    }

    override func scrollWheel(with event: NSEvent) {
        let isPrimarilyVertical = abs(event.scrollingDeltaY) > abs(event.scrollingDeltaX)

        if isPrimarilyVertical {
            let pinchAmount = (event.scrollingDeltaY * 0.008).clamped(to: -0.22...0.22)
            zoom(by: pinchAmount, around: convert(event.locationInWindow, from: nil))
            return
        }

        let multiplier: CGFloat = event.hasPreciseScrollingDeltas ? 1.0 : 12.0
        camera.origin.x += (event.scrollingDeltaX * multiplier) / camera.zoom
        camera.origin.y += (event.scrollingDeltaY * multiplier) / camera.zoom
        relayoutTiles()
        needsDisplay = true
    }

    override func magnify(with event: NSEvent) {
        zoom(by: event.magnification, around: convert(event.locationInWindow, from: nil))
    }

    private func createTerminal(at worldPoint: CGPoint) {
        let size = CGSize(width: 620, height: 410)
        let frame = CGRect(
            x: worldPoint.x - size.width / 2,
            y: worldPoint.y - size.height / 2,
            width: size.width,
            height: size.height
        )
        let tileID = UUID()
        let accent = tiles.isEmpty ? CanvasTheme.emerald : CanvasTheme.cyan
        let tileView = TerminalTileView(id: tileID, accent: accent)

        tileView.onRequestFocus = { [weak self] id in
            self?.focusTile(id: id, makeTerminalFirstResponder: false)
        }
        tileView.onDragStart = { [weak self] id, point in
            self?.beginDraggingTile(id: id, windowPoint: point)
        }
        tileView.onDragMove = { [weak self] id, point in
            self?.dragTile(id: id, windowPoint: point)
        }
        tileView.onDragEnd = { [weak self] id in
            self?.endDraggingTile(id: id)
        }
        tileView.onResizeStart = { [weak self] id, handle, point in
            self?.beginResizingTile(id: id, handle: handle, windowPoint: point)
        }
        tileView.onResizeMove = { [weak self] id, handle, point in
            self?.resizeTile(id: id, handle: handle, windowPoint: point)
        }
        tileView.onResizeEnd = { [weak self] id, handle in
            self?.endResizingTile(id: id, handle: handle)
        }
        tileView.onTitleChanged = { [weak self] id, title in
            self?.updateTile(id: id) { tile in
                tile.title = title
            }
        }
        tileView.onRequestClose = { [weak self] id in
            self?.closeTile(id: id)
        }
        addSubview(tileView)
        let tile = TileState(id: tileID, accent: accent, worldFrame: frame, title: "Terminal", tileView: tileView)
        tiles.append(tile)
        focusTile(id: tileID, makeTerminalFirstResponder: true)
        relayoutTiles()
        needsDisplay = true
    }

    private func closeTile(id: UUID) {
        guard let index = tiles.firstIndex(where: { $0.id == id }) else { return }
        let tile = tiles.remove(at: index)
        tile.tileView.shutdown()
        tile.tileView.removeFromSuperview()

        if focusedTileID == id {
            focusedTileID = tiles.last?.id
        }

        updateTilePresentation()
        needsDisplay = true
    }

    private func beginDraggingTile(id: UUID, windowPoint: CGPoint) {
        guard let tile = tile(for: id) else { return }
        let point = convert(windowPoint, from: nil)
        focusTile(id: id, makeTerminalFirstResponder: false)
        interaction = .draggingTile(id: id, anchor: point, initialFrame: tile.worldFrame)
    }

    private func dragTile(id: UUID, windowPoint: CGPoint) {
        guard case let .draggingTile(activeID, anchor, initialFrame) = interaction, activeID == id else { return }
        let point = convert(windowPoint, from: nil)
        let delta = (point - anchor) / camera.zoom
        updateTile(id: id) { tile in
            tile.worldFrame.origin = initialFrame.origin + delta
        }
        relayoutTiles()
        needsDisplay = true
    }

    private func endDraggingTile(id: UUID) {
        if case let .draggingTile(activeID, _, _) = interaction, activeID == id {
            interaction = .idle
        }
    }

    private func beginResizingTile(id: UUID, handle: ResizeHandle, windowPoint: CGPoint) {
        guard let tile = tile(for: id) else { return }
        let point = convert(windowPoint, from: nil)
        focusTile(id: id, makeTerminalFirstResponder: false)
        interaction = .resizingTile(id: id, handle: handle, anchor: point, initialFrame: tile.worldFrame)
    }

    private func resizeTile(id: UUID, handle: ResizeHandle, windowPoint: CGPoint) {
        guard case let .resizingTile(activeID, activeHandle, anchor, initialFrame) = interaction,
              activeID == id,
              activeHandle == handle
        else { return }

        let point = convert(windowPoint, from: nil)
        let delta = (point - anchor) / camera.zoom
        updateTile(id: id) { tile in
            tile.worldFrame = resizedFrame(from: initialFrame, using: handle, delta: delta)
        }
        relayoutTiles()
        needsDisplay = true
    }

    private func endResizingTile(id: UUID, handle: ResizeHandle) {
        if case let .resizingTile(activeID, activeHandle, _, _) = interaction,
           activeID == id,
           activeHandle == handle {
            interaction = .idle
        }
    }

    private func focusTile(id: UUID, makeTerminalFirstResponder: Bool) {
        guard tile(for: id) != nil else { return }
        focusedTileID = id
        bringTileToFront(id: id)
        updateTilePresentation()

        if makeTerminalFirstResponder, let tile = tile(for: id) {
            window?.makeFirstResponder(tile.tileView.terminalResponder)
        }

        relayoutTiles()
        needsDisplay = true
    }

    private func zoom(by amount: CGFloat, around anchorPoint: CGPoint) {
        let worldBefore = viewToWorld(anchorPoint)
        camera.zoom = (camera.zoom * (1.0 + amount)).clamped(to: 0.45...2.4)
        let worldAfter = viewToWorld(anchorPoint)
        camera.origin = camera.origin + (worldBefore - worldAfter)
        relayoutTiles()
        needsDisplay = true
    }

    private func resizedFrame(from initialFrame: CGRect, using handle: ResizeHandle, delta: CGPoint) -> CGRect {
        var frame = initialFrame

        switch handle {
        case .left, .topLeft, .bottomLeft:
            let maxInset = initialFrame.width - minimumTileSize.width
            let clampedDeltaX = delta.x.clamped(to: -CGFloat.greatestFiniteMagnitude...maxInset)
            frame.origin.x = initialFrame.origin.x + clampedDeltaX
            frame.size.width = initialFrame.width - clampedDeltaX
        case .right, .topRight, .bottomRight:
            frame.size.width = max(minimumTileSize.width, initialFrame.width + delta.x)
        case .top, .bottom:
            break
        }

        switch handle {
        case .top, .topLeft, .topRight:
            let maxInset = initialFrame.height - minimumTileSize.height
            let clampedDeltaY = delta.y.clamped(to: -CGFloat.greatestFiniteMagnitude...maxInset)
            frame.origin.y = initialFrame.origin.y + clampedDeltaY
            frame.size.height = initialFrame.height - clampedDeltaY
        case .bottom, .bottomLeft, .bottomRight:
            frame.size.height = max(minimumTileSize.height, initialFrame.height + delta.y)
        case .left, .right:
            break
        }

        return frame
    }

    private func installEventMonitorsIfNeeded() {
        guard scrollMonitor == nil, magnifyMonitor == nil else { return }

        scrollMonitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
            guard let self, event.window === self.window else { return event }

            let anchor = self.convert(event.locationInWindow, from: nil)
            guard self.bounds.contains(anchor) else { return event }

            let isPrimarilyVertical = abs(event.scrollingDeltaY) > abs(event.scrollingDeltaX)
            let hasZoomModifier = event.modifierFlags.intersection([.command, .option]).isEmpty == false

            guard isPrimarilyVertical || hasZoomModifier else { return event }

            let amount = (event.scrollingDeltaY * 0.008).clamped(to: -0.22...0.22)
            self.zoom(by: amount, around: anchor)
            return nil
        }

        magnifyMonitor = NSEvent.addLocalMonitorForEvents(matching: .magnify) { [weak self] event in
            guard let self, event.window === self.window else { return event }

            let anchor = self.convert(event.locationInWindow, from: nil)
            guard self.bounds.contains(anchor) else { return event }

            self.zoom(by: event.magnification, around: anchor)
            return nil
        }
    }

    private func relayoutTiles() {
        for (index, tile) in tiles.enumerated() {
            tile.tileView.frame = tile.worldFrame.scaled(from: camera.origin, zoom: camera.zoom)
            tile.tileView.layer?.zPosition = CGFloat(index)
            tile.tileView.applyScale(camera.zoom, focused: tile.id == focusedTileID)
        }
    }

    private func updateTilePresentation() {
        for tile in tiles {
            tile.tileView.applyScale(camera.zoom, focused: tile.id == focusedTileID)
        }
    }

    private func bringTileToFront(id: UUID) {
        guard let index = tiles.firstIndex(where: { $0.id == id }) else { return }
        let tile = tiles.remove(at: index)
        tiles.append(tile)
        for (zIndex, candidate) in tiles.enumerated() {
            candidate.tileView.layer?.zPosition = CGFloat(zIndex)
        }
    }

    private func tile(for id: UUID) -> TileState? {
        tiles.first(where: { $0.id == id })
    }

    private func updateTile(id: UUID, update: (TileState) -> Void) {
        guard let tile = tile(for: id) else { return }
        update(tile)
    }

    private func tileID(at point: CGPoint) -> UUID? {
        for tile in tiles.reversed() where tile.tileView.frame.contains(point) {
            return tile.id
        }
        return nil
    }

    private func worldToView(_ point: CGPoint) -> CGPoint {
        CGPoint(
            x: (point.x - camera.origin.x) * camera.zoom,
            y: (point.y - camera.origin.y) * camera.zoom
        )
    }

    private func viewToWorld(_ point: CGPoint) -> CGPoint {
        CGPoint(
            x: camera.origin.x + point.x / camera.zoom,
            y: camera.origin.y + point.y / camera.zoom
        )
    }

    private func visibleWorldRect() -> CGRect {
        CGRect(
            x: camera.origin.x,
            y: camera.origin.y,
            width: bounds.width / camera.zoom,
            height: bounds.height / camera.zoom
        )
    }

    private func drawBackground(in rect: CGRect) {
        CanvasTheme.background.setFill()
        rect.fill()
    }

    private func drawGrid(in rect: CGRect) {
        let visible = visibleWorldRect()
        var spacing: CGFloat = 26

        while spacing * camera.zoom < 16 {
            spacing *= 2
        }

        let majorEvery = spacing * 4
        let startX = floor(visible.minX / spacing) * spacing
        let endX = visible.maxX + spacing
        let startY = floor(visible.minY / spacing) * spacing
        let endY = visible.maxY + spacing

        let minorSize = max(1.6, min(2.2, camera.zoom * 1.15))
        let majorSize = minorSize + 0.4

        var x = startX
        while x <= endX {
            var y = startY
            while y <= endY {
                let point = worldToView(CGPoint(x: x, y: y))
                let isMajor = abs((x / majorEvery).rounded() - (x / majorEvery)) < 0.0001
                    && abs((y / majorEvery).rounded() - (y / majorEvery)) < 0.0001
                let size = isMajor ? majorSize : minorSize
                let dotRect = CGRect(x: point.x - size / 2, y: point.y - size / 2, width: size, height: size)
                (isMajor ? CanvasTheme.gridMajor : CanvasTheme.gridMinor).setFill()
                NSBezierPath(roundedRect: dotRect, xRadius: size / 2, yRadius: size / 2).fill()
                y += spacing
            }
            x += spacing
        }
    }

    private func drawOverlay() {
        let titleAttributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 14, weight: .semibold),
            .foregroundColor: CanvasTheme.titleText,
        ]
        let eyebrowAttributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 11, weight: .medium),
            .foregroundColor: CanvasTheme.mutedText,
        ]
        let subtitleAttributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 11, weight: .regular),
            .foregroundColor: CanvasTheme.mutedText,
        ]
        let statusAttributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 11, weight: .medium),
            .foregroundColor: CanvasTheme.bodyText,
        ]
        let hintAttributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 11, weight: .regular),
            .foregroundColor: CanvasTheme.mutedText,
        ]

        let titleText = "CANVASFLOW"
        let eyebrowText = "native terminal canvas"
        let subtitleText = "right click: new terminal   |   drag header: move"
        let titleWidth = titleText.size(withAttributes: titleAttributes).width
        let eyebrowWidth = eyebrowText.size(withAttributes: eyebrowAttributes).width
        let subtitleWidth = subtitleText.size(withAttributes: subtitleAttributes).width
        let infoWidth = max(360, max(14 + titleWidth + 26 + eyebrowWidth + 20, subtitleWidth + 28))
        let infoPanel = CGRect(x: 22, y: 22, width: infoWidth, height: 64)
        drawPanel(in: infoPanel, fill: CanvasTheme.panel, stroke: CanvasTheme.border, radius: 10)
        titleText.draw(at: CGPoint(x: infoPanel.minX + 16, y: infoPanel.minY + 14), withAttributes: titleAttributes)
        eyebrowText.draw(at: CGPoint(x: infoPanel.minX + 16 + titleWidth + 26, y: infoPanel.minY + 14), withAttributes: eyebrowAttributes)
        subtitleText.draw(
            at: CGPoint(x: infoPanel.minX + 16, y: infoPanel.minY + 36),
            withAttributes: subtitleAttributes
        )

        let statusText = String(format: "zoom %.0f%%  •  %d tile%@", camera.zoom * 100, tiles.count, tiles.count == 1 ? "" : "s")
        let statusSize = statusText.size(withAttributes: statusAttributes)
        let statusPanel = CGRect(x: bounds.maxX - statusSize.width - 38, y: 16, width: statusSize.width + 20, height: 28)
        drawPanel(in: statusPanel, fill: CanvasTheme.surface, stroke: CanvasTheme.border, radius: 9)
        statusText.draw(
            at: CGPoint(x: statusPanel.minX + 10, y: statusPanel.minY + 8),
            withAttributes: statusAttributes
        )

        let hintText = "two-finger up/down to zoom"
        let hintSize = hintText.size(withAttributes: hintAttributes)
        let hintPanel = CGRect(x: 22, y: bounds.maxY - 40, width: hintSize.width + 20, height: 24)
        drawPanel(in: hintPanel, fill: CanvasTheme.surfaceInset, stroke: CanvasTheme.border, radius: 8)
        hintText.draw(
            at: CGPoint(x: hintPanel.minX + 10, y: hintPanel.minY + 6),
            withAttributes: hintAttributes
        )

        if tiles.isEmpty {
            let emptyTitleAttributes: [NSAttributedString.Key: Any] = [
                .font: NSFont.monospacedSystemFont(ofSize: 14, weight: .semibold),
                .foregroundColor: CanvasTheme.titleText,
            ]
            let emptyBodyAttributes: [NSAttributedString.Key: Any] = [
                .font: NSFont.monospacedSystemFont(ofSize: 11, weight: .regular),
                .foregroundColor: CanvasTheme.mutedText,
            ]
            let emptyRect = CGRect(x: bounds.midX - 168, y: bounds.midY - 44, width: 336, height: 88)
            drawPanel(in: emptyRect, fill: CanvasTheme.surface, stroke: CanvasTheme.borderStrong, radius: 12)

            "Create your first shell".draw(
                at: CGPoint(x: emptyRect.minX + 18, y: emptyRect.minY + 18),
                withAttributes: emptyTitleAttributes
            )
            "open the board menu with a right click anywhere on the canvas".draw(
                at: CGPoint(x: emptyRect.minX + 18, y: emptyRect.minY + 40),
                withAttributes: emptyBodyAttributes
            )
        }
    }

    private func drawPanel(in rect: CGRect, fill: NSColor, stroke: NSColor, radius: CGFloat) {
        let panelPath = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
        fill.setFill()
        panelPath.fill()
        stroke.setStroke()
        panelPath.lineWidth = 1
        panelPath.stroke()
    }
}
