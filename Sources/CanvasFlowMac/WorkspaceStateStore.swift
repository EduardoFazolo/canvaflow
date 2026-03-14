import Foundation
import CoreGraphics

struct WorkspacePersistenceState: Codable {
    var schemaVersion: Int = 1
    var sidebarCollapsed: Bool
    var canvas: CanvasPersistenceState
}

struct CanvasPersistenceState: Codable {
    var selectedWorkflowID: UUID?
    var workflows: [PersistedWorkflow]
}

struct PersistedWorkflow: Codable {
    var id: UUID
    var accentIndex: Int
    var folderPath: String
    var cameraOrigin: PersistedPoint
    var zoom: Double
    var focusedTileID: UUID?
    var tiles: [PersistedTile]
}

struct PersistedTile: Codable {
    var id: UUID
    var kind: PersistedTileKind
    var title: String
    var worldFrame: PersistedRect
    var sessionName: String?
}

enum PersistedTileKind: String, Codable {
    case terminal
    case codexThread
}

struct PersistedPoint: Codable {
    var x: Double
    var y: Double

    init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }

    init(_ point: CGPoint) {
        self.init(x: point.x, y: point.y)
    }

    var cgPoint: CGPoint {
        CGPoint(x: x, y: y)
    }
}

struct PersistedRect: Codable {
    var x: Double
    var y: Double
    var width: Double
    var height: Double

    init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }

    init(_ rect: CGRect) {
        self.init(x: rect.origin.x, y: rect.origin.y, width: rect.width, height: rect.height)
    }

    var cgRect: CGRect {
        CGRect(x: x, y: y, width: width, height: height)
    }
}

final class WorkspaceStateStore {
    private let fileURL: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private var pendingSaveWorkItem: DispatchWorkItem?

    init() {
        let appSupportDirectory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support", isDirectory: true)
        let directoryURL = appSupportDirectory.appendingPathComponent("CanvasFlow", isDirectory: true)
        self.fileURL = directoryURL.appendingPathComponent("workspace-state.json", isDirectory: false)
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    }

    func load() -> WorkspacePersistenceState? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? decoder.decode(WorkspacePersistenceState.self, from: data)
    }

    func scheduleSave(_ state: WorkspacePersistenceState) {
        pendingSaveWorkItem?.cancel()

        let workItem = DispatchWorkItem { [weak self] in
            self?.save(state)
        }
        pendingSaveWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: workItem)
    }

    func save(_ state: WorkspacePersistenceState) {
        pendingSaveWorkItem?.cancel()
        pendingSaveWorkItem = nil

        let directoryURL = fileURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true)

        guard let data = try? encoder.encode(state) else { return }
        try? data.write(to: fileURL, options: [.atomic])
    }
}
