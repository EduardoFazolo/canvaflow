import AppKit

final class WorkflowNameSheetController: NSObject, NSTextFieldDelegate {
    private weak var parentWindow: NSWindow?
    private let completion: (String?) -> Void

    private let sheetWindow: NSWindow
    private let titleLabel = NSTextField(labelWithString: "Name your workflow")
    private let bodyLabel = NSTextField(labelWithString: "Each canvas needs a specific label so navigation stays meaningful.")
    private let nameFieldContainer = NSView(frame: .zero)
    private let nameField = NSTextField(frame: .zero)
    private let cancelButton = NSButton(title: "Cancel", target: nil, action: nil)
    private let createButton = NSButton(title: "Create workflow", target: nil, action: nil)

    init(parentWindow: NSWindow, completion: @escaping (String?) -> Void) {
        self.parentWindow = parentWindow
        self.completion = completion

        self.sheetWindow = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 220),
            styleMask: [.titled],
            backing: .buffered,
            defer: false
        )

        super.init()
        configureWindow()
    }

    func begin() {
        guard let parentWindow else { return }
        parentWindow.beginSheet(sheetWindow) { [weak self] _ in
            guard let self else { return }
            self.completion(nil)
        }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.sheetWindow.makeKey()
            self.sheetWindow.makeFirstResponder(self.nameField)
        }
    }

    func controlTextDidChange(_ obj: Notification) {
        createButton.isEnabled = currentName.isEmpty == false
    }

    private var currentName: String {
        nameField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func configureWindow() {
        sheetWindow.title = "New Workflow"
        sheetWindow.isReleasedWhenClosed = false
        sheetWindow.titleVisibility = .hidden
        sheetWindow.titlebarAppearsTransparent = true
        sheetWindow.backgroundColor = CanvasTheme.surface

        let contentView = FlippedSheetContentView(frame: sheetWindow.contentView?.bounds ?? .zero)
        contentView.wantsLayer = true
        contentView.layer?.backgroundColor = CanvasTheme.surface.cgColor
        sheetWindow.contentView = contentView

        titleLabel.font = CanvasTypography.displayFont(size: 20)
        titleLabel.textColor = CanvasTheme.titleText

        bodyLabel.font = CanvasTypography.bodyFont(size: 12, weight: .regular)
        bodyLabel.textColor = CanvasTheme.mutedText
        bodyLabel.maximumNumberOfLines = 2
        bodyLabel.lineBreakMode = .byWordWrapping

        nameFieldContainer.wantsLayer = true
        nameFieldContainer.layer?.cornerRadius = 10
        nameFieldContainer.layer?.borderWidth = 1
        nameFieldContainer.layer?.borderColor = CanvasTheme.borderStrong.cgColor
        nameFieldContainer.layer?.backgroundColor = CanvasTheme.surfaceInset.cgColor

        nameField.font = CanvasTypography.bodyFont(size: 13, weight: .medium)
        nameField.textColor = CanvasTheme.titleText
        nameField.stringValue = ""
        nameField.isEditable = true
        nameField.isSelectable = true
        nameField.isBezeled = false
        nameField.isBordered = false
        nameField.drawsBackground = false
        nameField.focusRingType = .none
        nameField.placeholderString = "Marketing launch, OCR R&D, Client onboarding..."
        nameField.delegate = self

        configureButton(cancelButton, title: "Cancel", emphasized: false, action: #selector(handleCancel))
        configureButton(createButton, title: "Create workflow", emphasized: true, action: #selector(handleCreate))
        createButton.isEnabled = false

        let inset = CanvasMetrics.cardInsetX
        let contentWidth = contentView.bounds.width - (inset * 2)
        let createWidth: CGFloat = 156
        let cancelWidth: CGFloat = 104

        titleLabel.frame = CGRect(x: inset, y: 24, width: contentWidth, height: 28)
        bodyLabel.frame = CGRect(x: inset, y: 60, width: contentWidth, height: 36)
        nameFieldContainer.frame = CGRect(x: inset, y: 108, width: contentWidth, height: 40)
        nameField.frame = CGRect(x: 14, y: 8, width: contentWidth - 28, height: 24)
        cancelButton.frame = CGRect(x: contentView.bounds.width - inset - createWidth - cancelWidth - CanvasMetrics.controlGap, y: 164, width: cancelWidth, height: 32)
        createButton.frame = CGRect(x: contentView.bounds.width - inset - createWidth, y: 164, width: createWidth, height: 32)

        contentView.addSubview(titleLabel)
        contentView.addSubview(bodyLabel)
        nameFieldContainer.addSubview(nameField)
        contentView.addSubview(nameFieldContainer)
        contentView.addSubview(cancelButton)
        contentView.addSubview(createButton)
    }

    private func configureButton(_ button: NSButton, title: String, emphasized: Bool, action: Selector) {
        button.title = title
        button.target = self
        button.action = action
        button.font = CanvasTypography.bodyFont(size: 11, weight: .semibold)
        button.contentTintColor = emphasized ? CanvasTheme.titleText : CanvasTheme.bodyText
        button.isBordered = false
        button.bezelStyle = .rounded
        button.wantsLayer = true
        button.layer?.cornerRadius = 8
        button.layer?.borderWidth = 1
        button.layer?.borderColor = (emphasized ? CanvasTheme.sidebarSelectionBorder : CanvasTheme.border).cgColor
        button.layer?.backgroundColor = (emphasized ? CanvasTheme.sidebarSelection : CanvasTheme.surfaceRaised).cgColor
    }

    @objc
    private func handleCancel() {
        close(with: nil)
    }

    @objc
    private func handleCreate() {
        let name = currentName
        guard name.isEmpty == false else { return }
        close(with: name)
    }

    private func close(with result: String?) {
        guard let parentWindow else {
            completion(result)
            return
        }

        parentWindow.endSheet(sheetWindow)
        sheetWindow.orderOut(nil)
        completion(result)
    }
}

private final class FlippedSheetContentView: NSView {
    override var isFlipped: Bool {
        true
    }
}
