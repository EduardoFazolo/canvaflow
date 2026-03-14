import AppKit

final class WorkflowSidebarView: NSView {
    var onCreateWorkflow: (() -> Void)?
    var onSelectWorkflow: ((UUID) -> Void)?
    var onToggleCollapsed: ((Bool) -> Void)?

    private var workflows: [WorkflowSummary] = []

    private let eyebrowLabel = NSTextField(labelWithString: "WORKSPACE")
    private let titleLabel = NSTextField(labelWithString: "CanvasFlow")
    private let summaryLabel = NSTextField(labelWithString: "Create a named workflow to begin.")
    private let countBadge = NSTextField(labelWithString: "0")
    private let createButton = NSButton(title: "+ New canvas", target: nil, action: nil)
    private let toggleButton = NSButton(title: "Collapse", target: nil, action: nil)
    private let sectionLabel = NSTextField(labelWithString: "CANVASES")
    private let scrollView = NSScrollView(frame: .zero)
    private let listView = WorkflowListView(frame: .zero)
    private let expandedViews: [NSView]

    private(set) var isCollapsed = false

    var preferredWidth: CGFloat {
        isCollapsed ? CanvasMetrics.collapsedSidebarWidth : CanvasMetrics.sidebarWidth
    }

    override init(frame frameRect: NSRect) {
        self.expandedViews = []
        super.init(frame: frameRect)
        wantsLayer = true
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

        let inset = CanvasMetrics.inset
        let topInset = CanvasMetrics.sidebarTopInset

        if isCollapsed {
            toggleButton.frame = CGRect(
                x: CanvasMetrics.compactInset,
                y: topInset,
                width: 48,
                height: CanvasMetrics.compactControlHeight
            )
            createButton.frame = CGRect(
                x: CanvasMetrics.compactInset,
                y: topInset + CanvasMetrics.compactControlHeight + CanvasMetrics.controlGap,
                width: 48,
                height: CanvasMetrics.compactControlHeight
            )
            scrollView.frame = CGRect(
                x: CanvasMetrics.compactInset,
                y: topInset + (CanvasMetrics.compactControlHeight * 2) + (CanvasMetrics.controlGap * 2),
                width: bounds.width - (CanvasMetrics.compactInset * 2),
                height: max(120, bounds.height - (topInset + (CanvasMetrics.compactControlHeight * 2) + (CanvasMetrics.controlGap * 3)))
            )
        } else {
            let contentWidth = bounds.width - (inset * 2)
            let buttonY = topInset + 94
            let toggleWidth: CGFloat = 98
            let createWidth = contentWidth - toggleWidth - CanvasMetrics.controlGap
            let badgeAttributes: [NSAttributedString.Key: Any] = [
                .font: NSFont.monospacedSystemFont(ofSize: 10, weight: .semibold),
            ]
            let badgeWidth = max(
                CanvasMetrics.badgeMinWidth,
                countBadge.stringValue.size(withAttributes: badgeAttributes).width + (CanvasMetrics.badgeHorizontalPadding * 2)
            )

            eyebrowLabel.frame = CGRect(x: inset, y: topInset, width: 110, height: 14)
            countBadge.frame = CGRect(
                x: bounds.width - inset - badgeWidth,
                y: topInset - 1,
                width: badgeWidth,
                height: CanvasMetrics.badgeHeight
            )
            titleLabel.frame = CGRect(x: inset, y: topInset + 28, width: contentWidth, height: 30)
            summaryLabel.frame = CGRect(x: inset, y: topInset + 64, width: contentWidth, height: 18)
            createButton.frame = CGRect(x: inset, y: buttonY, width: createWidth, height: CanvasMetrics.controlHeight)
            toggleButton.frame = CGRect(
                x: bounds.width - inset - toggleWidth,
                y: buttonY,
                width: toggleWidth,
                height: CanvasMetrics.controlHeight
            )
            sectionLabel.frame = CGRect(x: inset, y: topInset + 148, width: contentWidth, height: 14)
            scrollView.frame = CGRect(
                x: inset,
                y: topInset + 170,
                width: contentWidth,
                height: max(120, bounds.height - (topInset + 190))
            )
        }

        layoutList()
    }

    override func draw(_ dirtyRect: NSRect) {
        if isCollapsed {
            let shellRect = bounds.insetBy(dx: 0.5, dy: 0.5)
            let shell = NSBezierPath(roundedRect: shellRect, xRadius: 18, yRadius: 18)
            CanvasTheme.sidebar.withAlphaComponent(0.96).setFill()
            shell.fill()

            let wash = NSGradient(colors: [
                CanvasTheme.sidebarElevated.withAlphaComponent(0.92),
                CanvasTheme.sidebar.withAlphaComponent(0.48),
                CanvasTheme.sidebar.withAlphaComponent(0.16),
            ])
            wash?.draw(in: shellRect, angle: 90)

            CanvasTheme.border.setStroke()
            shell.lineWidth = 1
            shell.stroke()
        } else {
            CanvasTheme.sidebar.setFill()
            bounds.fill()

            let wash = NSGradient(colors: [
                CanvasTheme.sidebarElevated.withAlphaComponent(0.92),
                CanvasTheme.sidebar.withAlphaComponent(0.54),
                CanvasTheme.sidebar.withAlphaComponent(0.24),
            ])
            wash?.draw(in: bounds, angle: 90)

            let divider = NSBezierPath()
            divider.move(to: CGPoint(x: bounds.maxX - 0.5, y: 0))
            divider.line(to: CGPoint(x: bounds.maxX - 0.5, y: bounds.maxY))
            CanvasTheme.border.setStroke()
            divider.lineWidth = 1
            divider.stroke()
        }
    }

    func update(workflows: [WorkflowSummary], selectedWorkflowID: UUID?) {
        self.workflows = workflows
        countBadge.stringValue = "\(workflows.count)"

        if let selected = workflows.first(where: { $0.id == selectedWorkflowID }) {
            summaryLabel.stringValue = "\(selected.name) active • \(selected.terminalCount) terminal\(selected.terminalCount == 1 ? "" : "s")"
        } else if workflows.isEmpty {
            summaryLabel.stringValue = "Create a named workflow to begin."
        } else {
            summaryLabel.stringValue = "Choose a workflow from the stack."
        }

        listView.collapsed = isCollapsed
        listView.update(workflows: workflows, selectedWorkflowID: selectedWorkflowID)
        layoutList()
        needsDisplay = true
    }

    func setCollapsed(_ collapsed: Bool, animated: Bool) {
        guard collapsed != isCollapsed else { return }
        isCollapsed = collapsed
        toggleButton.title = isCollapsed ? "Open" : "Collapse"
        createButton.title = isCollapsed ? "+" : "+ New canvas"
        listView.collapsed = isCollapsed

        let expandedViews = [eyebrowLabel, titleLabel, summaryLabel, sectionLabel, countBadge]
        if animated {
            if collapsed == false {
                expandedViews.forEach {
                    $0.isHidden = false
                    $0.alphaValue = 0
                }
            }

            NSAnimationContext.runAnimationGroup { context in
                context.duration = CanvasMetrics.sidebarAnimationDuration
                context.timingFunction = CanvasMetrics.sidebarAnimationTiming
                expandedViews.forEach {
                    $0.animator().alphaValue = collapsed ? 0 : 1
                }
                self.layoutSubtreeIfNeeded()
            } completionHandler: {
                expandedViews.forEach {
                    $0.isHidden = collapsed
                    $0.alphaValue = 1
                }
            }
        } else {
            expandedViews.forEach {
                $0.isHidden = collapsed
                $0.alphaValue = 1
            }
            needsLayout = true
        }
    }

    private func setup() {
        layer?.cornerRadius = 18
        layer?.masksToBounds = false
        layer?.shadowColor = NSColor.black.withAlphaComponent(0.22).cgColor
        layer?.shadowOpacity = 1
        layer?.shadowRadius = 18
        layer?.shadowOffset = CGSize(width: 0, height: 10)

        eyebrowLabel.font = NSFont.monospacedSystemFont(ofSize: 10, weight: .semibold)
        eyebrowLabel.textColor = CanvasTheme.mutedText

        titleLabel.font = CanvasTypography.displayFont(size: 22)
        titleLabel.textColor = CanvasTheme.titleText

        summaryLabel.font = CanvasTypography.bodyFont(size: 12, weight: .regular)
        summaryLabel.textColor = CanvasTheme.mutedText
        summaryLabel.lineBreakMode = .byTruncatingTail

        countBadge.alignment = .center
        countBadge.font = NSFont.monospacedSystemFont(ofSize: 10, weight: .semibold)
        countBadge.textColor = CanvasTheme.titleText.withAlphaComponent(0.9)
        countBadge.wantsLayer = true
        countBadge.layer?.backgroundColor = CanvasTheme.surface.cgColor
        countBadge.layer?.cornerRadius = CanvasMetrics.badgeHeight / 2
        countBadge.layer?.borderWidth = 1
        countBadge.layer?.borderColor = CanvasTheme.border.withAlphaComponent(0.82).cgColor

        configureButton(createButton, title: "+ New canvas")
        createButton.target = self
        createButton.action = #selector(handleCreateWorkflow)

        configureButton(toggleButton, title: "Collapse")
        toggleButton.target = self
        toggleButton.action = #selector(handleToggleCollapsed)

        sectionLabel.font = NSFont.monospacedSystemFont(ofSize: 10, weight: .semibold)
        sectionLabel.textColor = CanvasTheme.mutedText

        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder
        scrollView.hasVerticalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.verticalScroller?.controlSize = .small
        scrollView.documentView = listView

        listView.onSelectWorkflow = { [weak self] id in
            self?.onSelectWorkflow?(id)
        }

        addSubview(eyebrowLabel)
        addSubview(titleLabel)
        addSubview(summaryLabel)
        addSubview(countBadge)
        addSubview(createButton)
        addSubview(toggleButton)
        addSubview(sectionLabel)
        addSubview(scrollView)

        setCollapsed(false, animated: false)
    }

    private func configureButton(_ button: NSButton, title: String) {
        button.title = title
        button.font = CanvasTypography.bodyFont(size: 11, weight: .semibold)
        button.contentTintColor = CanvasTheme.titleText
        button.isBordered = false
        button.bezelStyle = .rounded
        button.wantsLayer = true
        button.layer?.backgroundColor = CanvasTheme.surfaceRaised.cgColor
        button.layer?.cornerRadius = CanvasMetrics.controlRadius
        button.layer?.borderWidth = 1
        button.layer?.borderColor = CanvasTheme.borderStrong.cgColor
    }

    private func layoutList() {
        let width = max(0, scrollView.contentSize.width)
        let height = listView.requiredHeight(for: workflows.count)
        listView.frame = CGRect(x: 0, y: 0, width: width, height: max(height, scrollView.contentSize.height))
        listView.layoutRows()
    }

    @objc
    private func handleCreateWorkflow() {
        onCreateWorkflow?()
    }

    @objc
    private func handleToggleCollapsed() {
        let nextCollapsed = !isCollapsed
        setCollapsed(nextCollapsed, animated: true)
        onToggleCollapsed?(nextCollapsed)
    }
}

private final class WorkflowListView: NSView {
    var onSelectWorkflow: ((UUID) -> Void)?
    var collapsed = false

    private var rowViews: [WorkflowRowView] = []

    override var isFlipped: Bool {
        true
    }

    func update(workflows: [WorkflowSummary], selectedWorkflowID: UUID?) {
        rowViews.forEach { $0.removeFromSuperview() }
        rowViews.removeAll()

        for (index, workflow) in workflows.enumerated() {
            let row = WorkflowRowView(frame: .zero)
            row.workflowID = workflow.id
            row.index = index + 1
            row.accent = workflow.accent
            row.title = workflow.name
            row.subtitle = workflow.terminalCount == 0
                ? "Empty"
                : "\(workflow.terminalCount) terminal\(workflow.terminalCount == 1 ? "" : "s")"
            row.selected = workflow.id == selectedWorkflowID
            row.compact = collapsed
            row.onSelect = { [weak self] id in
                self?.onSelectWorkflow?(id)
            }
            addSubview(row)
            rowViews.append(row)
        }
    }

    func requiredHeight(for count: Int) -> CGFloat {
        guard count > 0 else { return 60 }
        let rowHeight: CGFloat = collapsed ? CanvasMetrics.compactRowHeight : CanvasMetrics.rowHeight
        let gap: CGFloat = CanvasMetrics.rowGap
        return CGFloat(count) * rowHeight + CGFloat(max(0, count - 1)) * gap + 10
    }

    func layoutRows() {
        let rowHeight: CGFloat = collapsed ? CanvasMetrics.compactRowHeight : CanvasMetrics.rowHeight
        let gap: CGFloat = CanvasMetrics.rowGap

        for (index, row) in rowViews.enumerated() {
            row.compact = collapsed
            row.frame = CGRect(
                x: 0,
                y: CGFloat(index) * (rowHeight + gap),
                width: bounds.width,
                height: rowHeight
            )
        }
    }
}

private final class WorkflowRowView: NSControl {
    var workflowID = UUID()
    var index = 1
    var accent = CanvasTheme.cyan { didSet { needsDisplay = true } }
    var title = "Canvas" { didSet { needsDisplay = true } }
    var subtitle = "Empty" { didSet { needsDisplay = true } }
    var selected = false { didSet { needsDisplay = true } }
    var compact = false { didSet { needsDisplay = true } }
    var onSelect: ((UUID) -> Void)?

    private var hovered = false { didSet { needsDisplay = true } }
    private var trackingAreaRef: NSTrackingArea?

    override var isFlipped: Bool {
        true
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let trackingAreaRef {
            removeTrackingArea(trackingAreaRef)
        }

        let trackingAreaRef = NSTrackingArea(
            rect: bounds,
            options: [.mouseEnteredAndExited, .activeInActiveApp, .inVisibleRect],
            owner: self,
            userInfo: nil
        )
        addTrackingArea(trackingAreaRef)
        self.trackingAreaRef = trackingAreaRef
    }

    override func resetCursorRects() {
        discardCursorRects()
        addCursorRect(bounds, cursor: .pointingHand)
    }

    override func mouseEntered(with event: NSEvent) {
        hovered = true
    }

    override func mouseExited(with event: NSEvent) {
        hovered = false
    }

    override func draw(_ dirtyRect: NSRect) {
        let shellRect = bounds.insetBy(dx: 0.5, dy: 0.5)
        let shell = NSBezierPath(roundedRect: shellRect, xRadius: CanvasMetrics.cardRadius - 2, yRadius: CanvasMetrics.cardRadius - 2)

        let fill: NSColor
        if selected {
            fill = CanvasTheme.sidebarSelection
        } else if hovered {
            fill = CanvasTheme.sidebarHover.withAlphaComponent(0.72)
        } else {
            fill = CanvasTheme.surfaceInset.withAlphaComponent(0.24)
        }

        fill.setFill()
        shell.fill()

        let stroke = selected ? CanvasTheme.sidebarSelectionBorder : CanvasTheme.border.withAlphaComponent(0.54)
        stroke.setStroke()
        shell.lineWidth = 1
        shell.stroke()

        let accentRect = CGRect(
            x: compact ? CanvasMetrics.compactInset : 16,
            y: compact ? 10 : 16,
            width: 3,
            height: bounds.height - (compact ? 20 : 32)
        )
        accent.setFill()
        NSBezierPath(roundedRect: accentRect, xRadius: 1.5, yRadius: 1.5).fill()

        let serialAttributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 10, weight: .medium),
            .foregroundColor: accent.withAlphaComponent(selected ? 0.94 : 0.76),
        ]

        if compact {
            String(format: "%02d", index).draw(
                in: CGRect(x: 22, y: bounds.midY - 7, width: bounds.width - 30, height: 14),
                withAttributes: serialAttributes
            )
            return
        }

        let titleAttributes: [NSAttributedString.Key: Any] = [
            .font: CanvasTypography.bodyFont(size: 13, weight: .semibold),
            .foregroundColor: CanvasTheme.titleText,
        ]
        let subtitleAttributes: [NSAttributedString.Key: Any] = [
            .font: CanvasTypography.bodyFont(size: 10.5, weight: .regular),
            .foregroundColor: selected ? CanvasTheme.bodyText : CanvasTheme.mutedText,
        ]

        title.draw(
            in: CGRect(x: 28, y: 14, width: bounds.width - 92, height: 18),
            withAttributes: titleAttributes
        )
        subtitle.draw(
            in: CGRect(x: 28, y: 35, width: bounds.width - 96, height: 14),
            withAttributes: subtitleAttributes
        )
        String(format: "%02d", index).draw(
            in: CGRect(x: bounds.width - 38, y: 14, width: 20, height: 14),
            withAttributes: serialAttributes
        )
    }

    override func mouseDown(with event: NSEvent) {
        onSelect?(workflowID)
    }
}
