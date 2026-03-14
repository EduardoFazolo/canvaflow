import AppKit

final class WorkspaceRootView: NSView {
    private let sidebarView = WorkflowSidebarView(frame: .zero)
    private let canvasView = CanvasView(frame: .zero)
    private var activeSheetController: WorkflowNameSheetController?

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
            self?.presentCreateWorkflowSheet()
        }
        sidebarView.onSelectWorkflow = { [weak self] id in
            self?.canvasView.selectWorkflow(id: id)
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

    private func presentCreateWorkflowSheet() {
        guard activeSheetController == nil, let window else { return }

        let controller = WorkflowNameSheetController(parentWindow: window) { [weak self] name in
            defer { self?.activeSheetController = nil }
            guard let self, let name else { return }
            self.canvasView.createWorkflow(named: name)
        }

        activeSheetController = controller
        controller.begin()
    }
}
