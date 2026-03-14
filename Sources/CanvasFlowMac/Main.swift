import AppKit

private var retainedController: AppController?

@main
enum CanvasFlowMacMain {
    static func main() {
        let application = NSApplication.shared
        let controller = AppController()

        retainedController = controller
        application.setActivationPolicy(.regular)
        application.delegate = controller
        application.activate(ignoringOtherApps: true)
        application.run()
    }
}
