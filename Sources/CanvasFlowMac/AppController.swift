import AppKit

final class AppController: NSObject, NSApplicationDelegate {
    private var window: NSWindow?
    private var canvasView: CanvasView?

    func applicationDidFinishLaunching(_ notification: Notification) {
        configureMenu()
        createWindow()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    private func configureMenu() {
        let mainMenu = NSMenu()

        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)

        let appMenu = NSMenu()
        let appName = ProcessInfo.processInfo.processName
        appMenu.addItem(
            withTitle: "Quit \(appName)",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )
        appMenuItem.submenu = appMenu

        NSApp.mainMenu = mainMenu
    }

    private func createWindow() {
        let frame = NSRect(x: 0, y: 0, width: 1500, height: 960)
        let window = NSWindow(
            contentRect: frame,
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )

        let canvasView = CanvasView(frame: frame)
        canvasView.autoresizingMask = [.width, .height]

        window.title = "CanvasFlow"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isOpaque = true
        window.backgroundColor = CanvasTheme.background
        window.minSize = NSSize(width: 980, height: 680)
        window.center()
        window.contentView = canvasView
        window.makeFirstResponder(canvasView)
        window.makeKeyAndOrderFront(nil)

        self.window = window
        self.canvasView = canvasView

        DispatchQueue.main.async {
            canvasView.spawnInitialTerminalIfNeeded()
        }
    }
}
