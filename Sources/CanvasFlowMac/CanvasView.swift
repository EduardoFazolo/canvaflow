import AppKit

final class CanvasView: NSView {
    var onWorkflowStateChange: (([WorkflowSummary], UUID?) -> Void)?
    var onPersistenceStateChange: (() -> Void)?
    var overlayLeadingInset: CGFloat = 22

    private let minimumTileSize = CGSize(width: 320, height: 220)
    private var interaction: InteractionState = .idle
    private var pendingSpawnWorldPoint: CGPoint = .zero
    private var scrollMonitor: Any?
    private var magnifyMonitor: Any?
    private var workflows: [WorkflowState] = []
    private var selectedWorkflowID: UUID?
    private var workflowSequence = 0
    private var tmuxAvailability: Bool?

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
        onPersistenceStateChange?()
    }

    func importWorkflow(from folderURL: URL) {
        let normalizedURL = normalizedFolderURL(folderURL)

        if let existingWorkflow = workflows.first(where: { normalizedFolderURL($0.folderURL) == normalizedURL }) {
            selectWorkflow(id: existingWorkflow.id)
            return
        }

        let workflow = makeWorkflow(for: normalizedURL)
        workflows.append(workflow)
        selectWorkflow(id: workflow.id)
    }

    func persistenceState() -> CanvasPersistenceState {
        CanvasPersistenceState(
            selectedWorkflowID: selectedWorkflowID,
            workflows: workflows.map { workflow in
                PersistedWorkflow(
                    id: workflow.id,
                    accentIndex: workflow.accentIndex,
                    folderPath: workflow.folderURL.path,
                    cameraOrigin: PersistedPoint(workflow.camera.origin),
                    zoom: Double(workflow.camera.zoom),
                    focusedTileID: workflow.focusedTileID,
                    tiles: workflow.tiles.map { tile in
                        PersistedTile(
                            id: tile.id,
                            kind: persistedTileKind(for: tile.kind),
                            title: tile.title,
                            worldFrame: PersistedRect(tile.worldFrame),
                            sessionName: tile.sessionName
                        )
                    }
                )
            }
        )
    }

    func restore(from persistenceState: CanvasPersistenceState) {
        subviews.forEach { $0.removeFromSuperview() }
        workflows.removeAll()
        selectedWorkflowID = nil

        let fileManager = FileManager.default

        workflows = persistenceState.workflows.compactMap { snapshot in
            let folderURL = URL(fileURLWithPath: snapshot.folderPath)
            guard fileManager.fileExists(atPath: folderURL.path) else { return nil }

            var camera = CameraState()
            camera.origin = snapshot.cameraOrigin.cgPoint
            camera.zoom = CGFloat(snapshot.zoom)

            let workflow = WorkflowState(
                id: snapshot.id,
                accentIndex: snapshot.accentIndex,
                folderURL: folderURL,
                name: folderURL.lastPathComponent.isEmpty ? folderURL.path : folderURL.lastPathComponent,
                accent: CanvasTheme.workflowAccent(at: snapshot.accentIndex),
                camera: camera,
                tiles: [],
                focusedTileID: snapshot.focusedTileID
            )

            workflow.tiles = snapshot.tiles.map { tileSnapshot in
                let kind = tileKind(for: tileSnapshot.kind)
                return makeTileState(
                    id: tileSnapshot.id,
                    kind: kind,
                    title: tileSnapshot.title,
                    worldFrame: tileSnapshot.worldFrame.cgRect,
                    in: workflow,
                    sessionName: tileSnapshot.sessionName,
                    runtimeState: restoredRuntimeState(for: kind, sessionName: tileSnapshot.sessionName)
                )
            }

            return workflow
        }

        workflowSequence = workflows.map(\.accentIndex).max().map { $0 + 1 } ?? 0

        if let restoredSelection = persistenceState.selectedWorkflowID,
           workflows.contains(where: { $0.id == restoredSelection }) {
            selectedWorkflowID = restoredSelection
        } else {
            selectedWorkflowID = workflows.first?.id
        }

        displayActiveWorkflow()
        publishWorkflowState()
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

    func startThread(in workflowID: UUID) {
        guard let workflow = workflows.first(where: { $0.id == workflowID }) else { return }
        let nextThreadIndex = workflow.tiles.filter { $0.kind == .codexThread }.count + 1
        selectWorkflow(id: workflowID)
        createTerminal(
            at: defaultSpawnPoint(for: workflow),
            in: workflow,
            kind: .codexThread,
            initialTitle: "Thread \(nextThreadIndex)"
        )
    }

    func focusThread(id: UUID, in workflowID: UUID) {
        guard let workflow = workflows.first(where: { $0.id == workflowID }),
              workflow.tiles.contains(where: { $0.id == id })
        else { return }

        selectWorkflow(id: workflowID)
        focusTile(id: id, makeTerminalFirstResponder: true, bringToFront: false)
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
        publishWorkflowState()
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
            onPersistenceStateChange?()

        case let .draggingTile(id, anchor, initialFrame):
            let delta = (point - anchor) / workflow.camera.zoom
            updateTile(id: id) { tile in
                tile.worldFrame.origin = initialFrame.origin + delta
            }
            relayoutTiles()
            needsDisplay = true
            onPersistenceStateChange?()

        case let .resizingTile(id, handle, anchor, initialFrame):
            let delta = (point - anchor) / workflow.camera.zoom
            updateTile(id: id) { tile in
                tile.worldFrame = resizedFrame(from: initialFrame, using: handle, delta: delta)
            }
            relayoutTiles()
            needsDisplay = true
            onPersistenceStateChange?()

        case .idle:
            break
        }
    }

    override func mouseUp(with event: NSEvent) {
        interaction = .idle
        onPersistenceStateChange?()
    }

    override func scrollWheel(with event: NSEvent) {
        guard let workflow = activeWorkflow else { return }
        let anchor = convert(event.locationInWindow, from: nil)
        let isPrimarilyVertical = abs(event.scrollingDeltaY) > abs(event.scrollingDeltaX)
        let hoveringTile = tileID(at: anchor) != nil

        if isPrimarilyVertical && hoveringTile == false {
            let pinchAmount = (event.scrollingDeltaY * 0.008).clamped(to: -0.22...0.22)
            zoom(by: pinchAmount, around: anchor)
            return
        }

        let multiplier: CGFloat = event.hasPreciseScrollingDeltas ? 1.0 : 12.0
        workflow.camera.origin.x += (event.scrollingDeltaX * multiplier) / workflow.camera.zoom
        workflow.camera.origin.y += (event.scrollingDeltaY * multiplier) / workflow.camera.zoom
        relayoutTiles()
        needsDisplay = true
        onPersistenceStateChange?()
    }

    override func magnify(with event: NSEvent) {
        zoom(by: event.magnification, around: convert(event.locationInWindow, from: nil))
    }

    private var activeWorkflow: WorkflowState? {
        workflows.first(where: { $0.id == selectedWorkflowID })
    }

    private func makeWorkflow(for folderURL: URL) -> WorkflowState {
        let accentIndex = workflowSequence
        workflowSequence += 1
        let displayName = folderURL.lastPathComponent.isEmpty ? folderURL.path : folderURL.lastPathComponent
        return WorkflowState(
            accentIndex: accentIndex,
            folderURL: folderURL,
            name: displayName,
            accent: CanvasTheme.workflowAccent(at: accentIndex)
        )
    }

    private func normalizedFolderURL(_ folderURL: URL) -> URL {
        folderURL.standardizedFileURL.resolvingSymlinksInPath()
    }

    private func workflowSummaries() -> [WorkflowSummary] {
        workflows.map { workflow in
            let threadTiles = workflow.tiles.filter { $0.kind == .codexThread }
            return WorkflowSummary(
                id: workflow.id,
                name: workflow.name,
                terminalCount: workflow.tiles.count,
                accent: workflow.accent,
                threadSummaries: threadTiles.map { ThreadSummary(id: $0.id, title: $0.title, runtimeState: $0.runtimeState) },
                focusedThreadID: selectedWorkflowID == workflow.id ? workflow.focusedTileID : nil
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
            tile.tileView.ensureProcessRunning()
        }

        updateTilePresentation()
        relayoutTiles()
        needsDisplay = true
    }

    private func createTerminal(
        at worldPoint: CGPoint,
        in workflow: WorkflowState? = nil,
        kind: TileKind = .terminal,
        initialTitle: String = "Terminal"
    ) {
        guard let workflow = workflow ?? activeWorkflow else { return }

        let size = CGSize(width: 620, height: 410)
        let frame = CGRect(
            x: worldPoint.x - size.width / 2,
            y: worldPoint.y - size.height / 2,
            width: size.width,
            height: size.height
        )
        let tile = makeTileState(
            kind: kind,
            title: initialTitle,
            worldFrame: frame,
            in: workflow
        )
        workflow.tiles.append(tile)

        if workflow.id == selectedWorkflowID {
            addSubview(tile.tileView)
            tile.tileView.ensureProcessRunning()
            focusTile(id: tile.id, makeTerminalFirstResponder: true)
        } else {
            workflow.focusedTileID = tile.id
        }

        publishWorkflowState()
    }

    private func defaultSpawnPoint(for workflow: WorkflowState) -> CGPoint {
        let visibleWidth = bounds.width / max(workflow.camera.zoom, 0.001)
        let visibleHeight = bounds.height / max(workflow.camera.zoom, 0.001)
        let offset = CGFloat(workflow.tiles.count) * 28

        return CGPoint(
            x: workflow.camera.origin.x + (visibleWidth * 0.56) + offset,
            y: workflow.camera.origin.y + (visibleHeight * 0.52) + offset
        )
    }

    private func makeTileState(
        id: UUID = UUID(),
        kind: TileKind,
        title: String,
        worldFrame: CGRect,
        in workflow: WorkflowState,
        sessionName: String? = nil,
        runtimeState: ThreadRuntimeState = .live
    ) -> TileState {
        let accent = workflow.tiles.isEmpty ? workflow.accent : CanvasTheme.workflowAccent(at: workflow.tiles.count)
        let resolvedSessionName: String?

        if kind == .codexThread {
            resolvedSessionName = sessionName ?? tmuxSessionName(workflowID: workflow.id, tileID: id)
        } else {
            resolvedSessionName = nil
        }

        let tileView = TerminalTileView(
            id: id,
            accent: accent,
            workingDirectory: workflow.folderURL.path,
            initialCommand: launchCommand(for: kind, sessionName: resolvedSessionName, workingDirectory: workflow.folderURL.path),
            initialTitle: title
        )

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
            self?.publishWorkflowState()
        }
        tileView.onRequestClose = { [weak self] id in
            self?.closeTile(id: id)
        }

        return TileState(
            id: id,
            kind: kind,
            accent: accent,
            sessionName: resolvedSessionName,
            runtimeState: runtimeState,
            worldFrame: worldFrame,
            title: title,
            tileView: tileView
        )
    }

    private func launchCommand(for kind: TileKind, sessionName: String?, workingDirectory: String) -> String? {
        switch kind {
        case .terminal:
            return nil
        case .codexThread:
            let resolvedSessionName = sessionName ?? "canvasflow-codex"
            let escapedSessionName = shellQuoted(resolvedSessionName)
            let escapedDirectory = shellQuoted(workingDirectory)
            let codexCommand = resolvedCodexCommand()
            let pathBootstrap = launchPathBootstrap()
            return "\(pathBootstrap)if command -v tmux >/dev/null 2>&1; then tmux new-session -A -s \(escapedSessionName) -c \(escapedDirectory) \(codexCommand); else \(codexCommand); fi"
        }
    }

    private func tmuxSessionName(workflowID: UUID, tileID: UUID) -> String {
        "canvasflow-\(workflowID.uuidString.lowercased())-\(tileID.uuidString.lowercased())"
    }

    private func shellQuoted(_ value: String) -> String {
        "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    private func resolvedCodexCommand() -> String {
        if let executablePath = findExecutablePath(named: "codex") {
            return shellQuoted(executablePath)
        }

        return "codex"
    }

    private func launchPathBootstrap() -> String {
        let directories = resolvedLaunchPathDirectories()
        guard directories.isEmpty == false else { return "" }
        let joinedDirectories = directories.joined(separator: ":")
        return "PATH=\(shellQuoted(joinedDirectories)):$PATH; export PATH; "
    }

    private func resolvedLaunchPathDirectories() -> [String] {
        var directories: [String] = []

        if let codexPath = findExecutablePath(named: "codex") {
            directories.append((codexPath as NSString).deletingLastPathComponent)
        }

        if let nodePath = findExecutablePath(named: "node") {
            directories.append((nodePath as NSString).deletingLastPathComponent)
        }

        return Array(NSOrderedSet(array: directories)) as? [String] ?? directories
    }

    private func findExecutablePath(named executableName: String) -> String? {
        let fileManager = FileManager.default
        let homeDirectory = fileManager.homeDirectoryForCurrentUser.path
        let pathEntries = (ProcessInfo.processInfo.environment["PATH"] ?? "")
            .split(separator: ":")
            .map(String.init)

        let candidateDirectories = pathEntries + [
            "\(homeDirectory)/.bun/bin",
            "\(homeDirectory)/.local/bin",
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "/usr/bin",
        ]

        for directory in candidateDirectories {
            let candidatePath = (directory as NSString).appendingPathComponent(executableName)
            if fileManager.isExecutableFile(atPath: candidatePath) {
                return candidatePath
            }
        }

        return nil
    }

    private func persistedTileKind(for kind: TileKind) -> PersistedTileKind {
        switch kind {
        case .terminal:
            .terminal
        case .codexThread:
            .codexThread
        }
    }

    private func tileKind(for persistedKind: PersistedTileKind) -> TileKind {
        switch persistedKind {
        case .terminal:
            .terminal
        case .codexThread:
            .codexThread
        }
    }

    private func killSession(named sessionName: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["tmux", "kill-session", "-t", sessionName]
        process.standardOutput = Pipe()
        process.standardError = Pipe()
        try? process.run()
    }

    private func restoredRuntimeState(for kind: TileKind, sessionName: String?) -> ThreadRuntimeState {
        guard kind == .codexThread else { return .live }
        guard let sessionName else { return .missing }
        return tmuxHasSession(named: sessionName) ? .live : .missing
    }

    private func tmuxHasSession(named sessionName: String) -> Bool {
        if let tmuxAvailability, tmuxAvailability == false {
            return false
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["tmux", "has-session", "-t", sessionName]
        process.standardOutput = Pipe()
        process.standardError = Pipe()

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            tmuxAvailability = false
            return false
        }

        tmuxAvailability = true
        return process.terminationStatus == 0
    }

    private func closeTile(id: UUID) {
        guard let workflow = activeWorkflow,
              let index = workflow.tiles.firstIndex(where: { $0.id == id })
        else { return }

        let tile = workflow.tiles.remove(at: index)
        if tile.kind == .codexThread, let sessionName = tile.sessionName {
            killSession(named: sessionName)
        }
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

    private func focusTile(id: UUID, makeTerminalFirstResponder: Bool, bringToFront: Bool = true) {
        guard let workflow = activeWorkflow, tile(for: id) != nil else { return }
        workflow.focusedTileID = id
        if bringToFront {
            bringTileToFront(id: id)
        }
        updateTilePresentation()

        if makeTerminalFirstResponder, let tile = tile(for: id) {
            tile.tileView.ensureProcessRunning()
            window?.makeFirstResponder(tile.tileView.terminalResponder)
        }

        relayoutTiles()
        needsDisplay = true
        publishWorkflowState()
    }

    private func zoom(by amount: CGFloat, around anchorPoint: CGPoint) {
        guard let workflow = activeWorkflow else { return }

        let worldBefore = viewToWorld(anchorPoint)
        workflow.camera.zoom = (workflow.camera.zoom * (1.0 + amount)).clamped(to: 0.45...2.4)
        let worldAfter = viewToWorld(anchorPoint)
        workflow.camera.origin = workflow.camera.origin + (worldBefore - worldAfter)
        relayoutTiles()
        needsDisplay = true
        onPersistenceStateChange?()
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
            let hoveringTile = self.tileID(at: anchor) != nil
            let hasZoomModifier = event.modifierFlags.intersection([.command, .option]).isEmpty == false

            if hasZoomModifier {
                let amount = (event.scrollingDeltaY * 0.008).clamped(to: -0.22...0.22)
                self.zoom(by: amount, around: anchor)
                return nil
            }

            guard isPrimarilyVertical, hoveringTile == false else { return event }

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
        let labelText = "ACTIVE WORKSPACE"
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
            at: CGPoint(x: statusPanel.minX + 12, y: statusPanel.minY + 4),
            withAttributes: statusAttributes
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
            let emptyBodyText = "Your other workspaces stay parked in the left rail while this folder stays ready."
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
        let bodyText = "Import a folder or create a new one from the left rail, then open terminals inside it."
        let titleWidth = "No workspace selected".size(withAttributes: titleAttributes).width
        let bodyWidth = bodyText.size(withAttributes: bodyAttributes).width
        let panelWidth = max(470, max(titleWidth, bodyWidth) + (CanvasMetrics.cardInsetX * 2))
        let panel = CGRect(x: bounds.midX - (panelWidth / 2), y: bounds.midY - 58, width: panelWidth, height: 116)
        drawPanel(in: panel, fill: CanvasTheme.surface, stroke: CanvasTheme.borderStrong, radius: CanvasMetrics.cardRadius)
        "No workspace selected".draw(
            at: CGPoint(x: panel.minX + CanvasMetrics.cardInsetX, y: panel.minY + 24),
            withAttributes: titleAttributes
        )
        bodyText.draw(
            at: CGPoint(x: panel.minX + CanvasMetrics.cardInsetX, y: panel.minY + 58),
            withAttributes: bodyAttributes
        )
    }
}
