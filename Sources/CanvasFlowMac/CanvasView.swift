import AppKit

final class CanvasView: NSView {
    var onWorkflowStateChange: (([WorkflowSummary], UUID?) -> Void)?
    var overlayLeadingInset: CGFloat = 22

    private let minimumTileSize = CGSize(width: 320, height: 220)
    private var interaction: InteractionState = .idle
    private var pendingSpawnWorldPoint: CGPoint = .zero
    private var scrollMonitor: Any?
    private var magnifyMonitor: Any?
    private var workflows: [WorkflowState] = []
    private var selectedWorkflowID: UUID?
    private var workflowSequence = 0

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.contentsScale = NSScreen.main?.backingScaleFactor ?? 2.0
        layer?.masksToBounds = true
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

    override var wantsDefaultClipping: Bool {
        true
    }

    func publishWorkflowState() {
        onWorkflowStateChange?(workflowSummaries(), selectedWorkflowID)
    }

    func createWorkflow(named name: String) {
        let workflow = makeWorkflow(named: name)
        workflows.append(workflow)
        selectWorkflow(id: workflow.id)
    }

    func selectWorkflow(id: UUID) {
        guard workflows.contains(where: { $0.id == id }) else { return }
        guard selectedWorkflowID != id else {
            publishWorkflowState()
            return
        }

        window?.makeFirstResponder(self)
        selectedWorkflowID = id
        displayActiveWorkflow()
        publishWorkflowState()
    }

    func spawnInitialTerminalIfNeeded() {
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        window?.makeFirstResponder(self)
        installEventMonitorsIfNeeded()
    }

    override func menu(for event: NSEvent) -> NSMenu? {
        guard activeWorkflow != nil else { return nil }

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
        guard let workflow = activeWorkflow else { return }

        window?.makeFirstResponder(self)

        let point = convert(event.locationInWindow, from: nil)
        guard tileID(at: point) == nil else { return }

        workflow.focusedTileID = nil
        updateTilePresentation()
        interaction = .panning(anchor: point, initialOrigin: workflow.camera.origin)
        needsDisplay = true
    }

    override func mouseDragged(with event: NSEvent) {
        guard let workflow = activeWorkflow else { return }

        let point = convert(event.locationInWindow, from: nil)

        switch interaction {
        case let .panning(anchor, initialOrigin):
            let delta = (point - anchor) / workflow.camera.zoom
            workflow.camera.origin = initialOrigin - delta
            relayoutTiles()
            needsDisplay = true

        case let .draggingTile(id, anchor, initialFrame):
            let delta = (point - anchor) / workflow.camera.zoom
            updateTile(id: id) { tile in
                tile.worldFrame.origin = initialFrame.origin + delta
            }
            relayoutTiles()
            needsDisplay = true

        case let .resizingTile(id, handle, anchor, initialFrame):
            let delta = (point - anchor) / workflow.camera.zoom
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
        guard let workflow = activeWorkflow else { return }

        let isPrimarilyVertical = abs(event.scrollingDeltaY) > abs(event.scrollingDeltaX)

        if isPrimarilyVertical {
            let pinchAmount = (event.scrollingDeltaY * 0.008).clamped(to: -0.22...0.22)
            zoom(by: pinchAmount, around: convert(event.locationInWindow, from: nil))
            return
        }

        let multiplier: CGFloat = event.hasPreciseScrollingDeltas ? 1.0 : 12.0
        workflow.camera.origin.x += (event.scrollingDeltaX * multiplier) / workflow.camera.zoom
        workflow.camera.origin.y += (event.scrollingDeltaY * multiplier) / workflow.camera.zoom
        relayoutTiles()
        needsDisplay = true
    }

    override func magnify(with event: NSEvent) {
        zoom(by: event.magnification, around: convert(event.locationInWindow, from: nil))
    }

    private var activeWorkflow: WorkflowState? {
        workflows.first(where: { $0.id == selectedWorkflowID })
    }

    private func makeWorkflow(named name: String) -> WorkflowState {
        workflowSequence += 1
        return WorkflowState(
            name: name,
            accent: CanvasTheme.workflowAccent(at: max(0, workflowSequence - 1))
        )
    }

    private func workflowSummaries() -> [WorkflowSummary] {
        workflows.map { workflow in
            WorkflowSummary(
                id: workflow.id,
                name: workflow.name,
                terminalCount: workflow.tiles.count,
                accent: workflow.accent
            )
        }
    }

    private func displayActiveWorkflow() {
        subviews.forEach { $0.removeFromSuperview() }

        guard let workflow = activeWorkflow else {
            needsDisplay = true
            return
        }

        for tile in workflow.tiles {
            addSubview(tile.tileView)
        }

        updateTilePresentation()
        relayoutTiles()
        needsDisplay = true
    }

    private func createTerminal(at worldPoint: CGPoint, in workflow: WorkflowState? = nil) {
        guard let workflow = workflow ?? activeWorkflow else { return }

        let size = CGSize(width: 620, height: 410)
        let frame = CGRect(
            x: worldPoint.x - size.width / 2,
            y: worldPoint.y - size.height / 2,
            width: size.width,
            height: size.height
        )
        let tileID = UUID()
        let accent = workflow.tiles.isEmpty ? workflow.accent : CanvasTheme.workflowAccent(at: workflow.tiles.count)
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

        let tile = TileState(id: tileID, accent: accent, worldFrame: frame, title: "Terminal", tileView: tileView)
        workflow.tiles.append(tile)

        if workflow.id == selectedWorkflowID {
            addSubview(tileView)
            focusTile(id: tileID, makeTerminalFirstResponder: true)
        } else {
            workflow.focusedTileID = tileID
        }

        publishWorkflowState()
    }

    private func closeTile(id: UUID) {
        guard let workflow = activeWorkflow,
              let index = workflow.tiles.firstIndex(where: { $0.id == id })
        else { return }

        let tile = workflow.tiles.remove(at: index)
        tile.tileView.shutdown()
        tile.tileView.removeFromSuperview()

        if workflow.focusedTileID == id {
            workflow.focusedTileID = workflow.tiles.last?.id
        }

        updateTilePresentation()
        publishWorkflowState()
        needsDisplay = true
    }

    private func beginDraggingTile(id: UUID, windowPoint: CGPoint) {
        guard let tile = tile(for: id) else { return }
        let point = convert(windowPoint, from: nil)
        focusTile(id: id, makeTerminalFirstResponder: false)
        interaction = .draggingTile(id: id, anchor: point, initialFrame: tile.worldFrame)
    }

    private func dragTile(id: UUID, windowPoint: CGPoint) {
        guard let workflow = activeWorkflow,
              case let .draggingTile(activeID, anchor, initialFrame) = interaction,
              activeID == id
        else { return }

        let point = convert(windowPoint, from: nil)
        let delta = (point - anchor) / workflow.camera.zoom
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
        guard let workflow = activeWorkflow,
              case let .resizingTile(activeID, activeHandle, anchor, initialFrame) = interaction,
              activeID == id,
              activeHandle == handle
        else { return }

        let point = convert(windowPoint, from: nil)
        let delta = (point - anchor) / workflow.camera.zoom
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
        guard let workflow = activeWorkflow, tile(for: id) != nil else { return }
        workflow.focusedTileID = id
        bringTileToFront(id: id)
        updateTilePresentation()

        if makeTerminalFirstResponder, let tile = tile(for: id) {
            window?.makeFirstResponder(tile.tileView.terminalResponder)
        }

        relayoutTiles()
        needsDisplay = true
    }

    private func zoom(by amount: CGFloat, around anchorPoint: CGPoint) {
        guard let workflow = activeWorkflow else { return }

        let worldBefore = viewToWorld(anchorPoint)
        workflow.camera.zoom = (workflow.camera.zoom * (1.0 + amount)).clamped(to: 0.45...2.4)
        let worldAfter = viewToWorld(anchorPoint)
        workflow.camera.origin = workflow.camera.origin + (worldBefore - worldAfter)
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
        guard let workflow = activeWorkflow else { return }

        for (index, tile) in workflow.tiles.enumerated() {
            tile.tileView.frame = tile.worldFrame.scaled(from: workflow.camera.origin, zoom: workflow.camera.zoom)
            tile.tileView.layer?.zPosition = CGFloat(index)
            tile.tileView.applyScale(workflow.camera.zoom, focused: tile.id == workflow.focusedTileID)
        }
    }

    private func updateTilePresentation() {
        guard let workflow = activeWorkflow else { return }

        for tile in workflow.tiles {
            tile.tileView.applyScale(workflow.camera.zoom, focused: tile.id == workflow.focusedTileID)
        }
    }

    private func bringTileToFront(id: UUID) {
        guard let workflow = activeWorkflow,
              let index = workflow.tiles.firstIndex(where: { $0.id == id })
        else { return }

        let tile = workflow.tiles.remove(at: index)
        workflow.tiles.append(tile)
        for (zIndex, candidate) in workflow.tiles.enumerated() {
            candidate.tileView.layer?.zPosition = CGFloat(zIndex)
        }
    }

    private func tile(for id: UUID) -> TileState? {
        activeWorkflow?.tiles.first(where: { $0.id == id })
    }

    private func updateTile(id: UUID, update: (TileState) -> Void) {
        guard let tile = tile(for: id) else { return }
        update(tile)
    }

    private func tileID(at point: CGPoint) -> UUID? {
        guard let workflow = activeWorkflow else { return nil }

        for tile in workflow.tiles.reversed() where tile.tileView.frame.contains(point) {
            return tile.id
        }
        return nil
    }

    private func worldToView(_ point: CGPoint) -> CGPoint {
        guard let workflow = activeWorkflow else { return point }

        return CGPoint(
            x: (point.x - workflow.camera.origin.x) * workflow.camera.zoom,
            y: (point.y - workflow.camera.origin.y) * workflow.camera.zoom
        )
    }

    private func viewToWorld(_ point: CGPoint) -> CGPoint {
        guard let workflow = activeWorkflow else { return point }

        return CGPoint(
            x: workflow.camera.origin.x + point.x / workflow.camera.zoom,
            y: workflow.camera.origin.y + point.y / workflow.camera.zoom
        )
    }

    private func visibleWorldRect() -> CGRect {
        guard let workflow = activeWorkflow else { return bounds }

        return CGRect(
            x: workflow.camera.origin.x,
            y: workflow.camera.origin.y,
            width: bounds.width / workflow.camera.zoom,
            height: bounds.height / workflow.camera.zoom
        )
    }

    private func drawBackground(in rect: CGRect) {
        CanvasTheme.background.setFill()
        rect.fill()
    }

    private func drawGrid(in rect: CGRect) {
        guard let workflow = activeWorkflow else { return }

        let visible = visibleWorldRect()
        var spacing: CGFloat = 26

        while spacing * workflow.camera.zoom < 16 {
            spacing *= 2
        }

        let majorEvery = spacing * 4
        let startX = floor(visible.minX / spacing) * spacing
        let endX = visible.maxX + spacing
        let startY = floor(visible.minY / spacing) * spacing
        let endY = visible.maxY + spacing

        let minorSize = max(1.6, min(2.2, workflow.camera.zoom * 1.15))
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
        if activeWorkflow == nil {
            drawNoWorkflowOverlay()
            return
        }

        guard let workflow = activeWorkflow else { return }

        let labelAttributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 10, weight: .medium),
            .foregroundColor: workflow.accent.withAlphaComponent(0.82),
        ]
        let titleAttributes: [NSAttributedString.Key: Any] = [
            .font: CanvasTypography.displayFont(size: 16),
            .foregroundColor: CanvasTheme.titleText,
        ]
        let subtitleAttributes: [NSAttributedString.Key: Any] = [
            .font: CanvasTypography.bodyFont(size: 10.5, weight: .regular),
            .foregroundColor: CanvasTheme.mutedText,
        ]
        let statusAttributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 11, weight: .medium),
            .foregroundColor: CanvasTheme.bodyText,
        ]
        let hintAttributes: [NSAttributedString.Key: Any] = [
            .font: CanvasTypography.bodyFont(size: 11, weight: .regular),
            .foregroundColor: CanvasTheme.mutedText,
        ]

        let labelText = "ACTIVE CANVAS"
        let titleText = workflow.name
        let subtitleText = "Right click to open a terminal. Drag the header to reposition."
        let labelWidth = labelText.size(withAttributes: labelAttributes).width
        let titleWidth = titleText.size(withAttributes: titleAttributes).width
        let subtitleWidth = subtitleText.size(withAttributes: subtitleAttributes).width
        let infoWidth = max(430, max(titleWidth + (CanvasMetrics.cardInsetX * 2), max(labelWidth + (CanvasMetrics.cardInsetX * 2), subtitleWidth + (CanvasMetrics.cardInsetX * 2))))
        let infoPanel = CGRect(x: overlayLeadingInset, y: 20, width: infoWidth, height: 82)
        drawPanel(in: infoPanel, fill: CanvasTheme.panel, stroke: CanvasTheme.border, radius: CanvasMetrics.cardRadius)
        labelText.draw(at: CGPoint(x: infoPanel.minX + CanvasMetrics.cardInsetX, y: infoPanel.minY + 12), withAttributes: labelAttributes)
        subtitleText.draw(
            at: CGPoint(x: infoPanel.minX + CanvasMetrics.cardInsetX, y: infoPanel.minY + 52),
            withAttributes: subtitleAttributes
        )
        titleText.draw(at: CGPoint(x: infoPanel.minX + CanvasMetrics.cardInsetX, y: infoPanel.minY + 28), withAttributes: titleAttributes)

        let statusText = String(
            format: "zoom %.0f%%  •  %d terminal%@",
            workflow.camera.zoom * 100,
            workflow.tiles.count,
            workflow.tiles.count == 1 ? "" : "s"
        )
        let statusSize = statusText.size(withAttributes: statusAttributes)
        let statusPanel = CGRect(
            x: bounds.maxX - statusSize.width - CanvasMetrics.cardInsetX - 24,
            y: 20,
            width: statusSize.width + 24,
            height: CanvasMetrics.badgeHeight
        )
        drawPanel(in: statusPanel, fill: CanvasTheme.surface, stroke: CanvasTheme.border, radius: CanvasMetrics.badgeHeight / 2)
        statusText.draw(
            at: CGPoint(x: statusPanel.minX + 12, y: statusPanel.minY + 8),
            withAttributes: statusAttributes
        )

        let hintText = "two-finger up/down to zoom"
        let hintSize = hintText.size(withAttributes: hintAttributes)
        let hintPanel = CGRect(
            x: overlayLeadingInset,
            y: bounds.maxY - 42,
            width: hintSize.width + 24,
            height: CanvasMetrics.badgeHeight
        )
        drawPanel(in: hintPanel, fill: CanvasTheme.surfaceInset, stroke: CanvasTheme.border, radius: CanvasMetrics.badgeHeight / 2)
        hintText.draw(
            at: CGPoint(x: hintPanel.minX + 12, y: hintPanel.minY + 8),
            withAttributes: hintAttributes
        )

        if workflow.tiles.isEmpty {
            let emptyTitleAttributes: [NSAttributedString.Key: Any] = [
                .font: CanvasTypography.displayFont(size: 16),
                .foregroundColor: CanvasTheme.titleText,
            ]
            let emptyBodyAttributes: [NSAttributedString.Key: Any] = [
                .font: CanvasTypography.bodyFont(size: 11, weight: .regular),
                .foregroundColor: CanvasTheme.mutedText,
            ]
            let emptyBodyText = "Your other canvases stay parked in the workflow rail on the left."
            let titleWidth = "\(workflow.name) is ready".size(withAttributes: emptyTitleAttributes).width
            let bodyLineOneWidth = "Right click anywhere on the board to open a terminal.".size(withAttributes: emptyBodyAttributes).width
            let bodyLineTwoWidth = emptyBodyText.size(withAttributes: emptyBodyAttributes).width
            let emptyWidth = max(420, max(titleWidth, max(bodyLineOneWidth, bodyLineTwoWidth)) + (CanvasMetrics.cardInsetX * 2))
            let emptyRect = CGRect(x: bounds.midX - (emptyWidth / 2), y: bounds.midY - 58, width: emptyWidth, height: 116)
            drawPanel(in: emptyRect, fill: CanvasTheme.surface, stroke: CanvasTheme.borderStrong, radius: CanvasMetrics.cardRadius)

            "\(workflow.name) is ready".draw(
                at: CGPoint(x: emptyRect.minX + CanvasMetrics.cardInsetX, y: emptyRect.minY + 22),
                withAttributes: emptyTitleAttributes
            )
            "Right click anywhere on the board to open a terminal.".draw(
                at: CGPoint(x: emptyRect.minX + CanvasMetrics.cardInsetX, y: emptyRect.minY + 54),
                withAttributes: emptyBodyAttributes
            )
            emptyBodyText.draw(
                at: CGPoint(x: emptyRect.minX + CanvasMetrics.cardInsetX, y: emptyRect.minY + 74),
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

    private func drawNoWorkflowOverlay() {
        let titleAttributes: [NSAttributedString.Key: Any] = [
            .font: CanvasTypography.displayFont(size: 18),
            .foregroundColor: CanvasTheme.titleText,
        ]
        let bodyAttributes: [NSAttributedString.Key: Any] = [
            .font: CanvasTypography.bodyFont(size: 12, weight: .regular),
            .foregroundColor: CanvasTheme.mutedText,
        ]
        let bodyText = "Use the workflow rail to create a named canvas, then open terminals inside it."
        let titleWidth = "No workflow selected".size(withAttributes: titleAttributes).width
        let bodyWidth = bodyText.size(withAttributes: bodyAttributes).width
        let panelWidth = max(470, max(titleWidth, bodyWidth) + (CanvasMetrics.cardInsetX * 2))
        let panel = CGRect(x: bounds.midX - (panelWidth / 2), y: bounds.midY - 58, width: panelWidth, height: 116)
        drawPanel(in: panel, fill: CanvasTheme.surface, stroke: CanvasTheme.borderStrong, radius: CanvasMetrics.cardRadius)
        "No workflow selected".draw(
            at: CGPoint(x: panel.minX + CanvasMetrics.cardInsetX, y: panel.minY + 24),
            withAttributes: titleAttributes
        )
        bodyText.draw(
            at: CGPoint(x: panel.minX + CanvasMetrics.cardInsetX, y: panel.minY + 58),
            withAttributes: bodyAttributes
        )
    }
}
