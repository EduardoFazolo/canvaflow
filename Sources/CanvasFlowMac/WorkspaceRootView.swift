import AppKit

final class WorkspaceRootView: NSView {
    private let sidebarView = WorkflowSidebarView(frame: .zero)
    private let canvasView = CanvasView(frame: .zero)

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.backgroundColor = CanvasTheme.background.cgColor
        setup()
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
        applyLayout(animated: false)
    }

    private func applyLayout(animated: Bool) {
        let sidebarWidth = sidebarView.preferredWidth
        let sidebarFrame = CGRect(
            x: 0,
            y: 0,
            width: sidebarWidth,
            height: bounds.height
        )
        let canvasFrame = CGRect(
            x: sidebarWidth,
            y: 0,
            width: max(0, bounds.width - sidebarWidth),
            height: bounds.height
        )
        let overlayInset = CanvasMetrics.canvasInset

        if animated {
            NSAnimationContext.runAnimationGroup { context in
                context.duration = CanvasMetrics.sidebarAnimationDuration
                context.timingFunction = CanvasMetrics.sidebarAnimationTiming
                sidebarView.animator().frame = sidebarFrame
                canvasView.animator().frame = canvasFrame
            }
        } else {
            sidebarView.frame = sidebarFrame
            canvasView.frame = canvasFrame
        }

        canvasView.overlayLeadingInset = overlayInset
    }

    private func setup() {
        sidebarView.autoresizingMask = [.height]
        canvasView.autoresizingMask = [.width, .height]

        sidebarView.onCreateWorkflow = { [weak self] in
            self?.presentWorkspacePicker()
        }
        sidebarView.onSelectWorkflow = { [weak self] id in
            self?.canvasView.selectWorkflow(id: id)
        }
        sidebarView.onStartThread = { [weak self] id in
            self?.canvasView.startThread(in: id)
        }
        sidebarView.onSelectThread = { [weak self] workflowID, threadID in
            self?.canvasView.focusThread(id: threadID, in: workflowID)
        }
        sidebarView.onToggleCollapsed = { [weak self] _ in
            self?.applyLayout(animated: true)
        }
        canvasView.onWorkflowStateChange = { [weak self] summaries, selectedID in
            self?.sidebarView.update(workflows: summaries, selectedWorkflowID: selectedID)
        }

        addSubview(canvasView)
        addSubview(sidebarView)
        canvasView.publishWorkflowState()
    }

    func spawnInitialTerminalIfNeeded() {
        canvasView.spawnInitialTerminalIfNeeded()
    }

    private func presentWorkspacePicker() {
        guard let window else { return }

        let panel = NSOpenPanel()
        panel.title = "Add Workspace"
        panel.message = "Choose an existing folder or create a new one for this workspace."
        panel.prompt = "Add Workspace"
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = true
        panel.directoryURL = FileManager.default.homeDirectoryForCurrentUser

        panel.beginSheetModal(for: window) { [weak self] response in
            guard response == .OK, let folderURL = panel.url else { return }
            self?.canvasView.importWorkflow(from: folderURL)
        }
    }
}
