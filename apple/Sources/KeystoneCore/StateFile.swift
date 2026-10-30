import Foundation

/// The saved state on disk: one JSON file in the app's data folder, in the same schema as
/// shared/data/seed.json's `state` block.
///   macOS:   ~/Library/Application Support/Keystone/state.json
///   Windows: %LOCALAPPDATA%\Keystone\state.json
public struct StateFile: Sendable {
    public let url: URL

    public init(url: URL) { self.url = url }

    public static var defaultFolder: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("Keystone", isDirectory: true)
    }

    public static var standard: StateFile { StateFile(url: defaultFolder.appendingPathComponent("state.json")) }

    /// The saved state, or nil when there is none yet. A file that exists but does not
    /// decode is moved aside as state.broken-<time>.json so it is never silently lost.
    public func load() -> TerminalState? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        do {
            return try JSONDecoder().decode(TerminalState.self, from: data)
        } catch {
            let aside = url.deletingLastPathComponent()
                .appendingPathComponent("state.broken-\(Int(Date().timeIntervalSince1970)).json")
            try? FileManager.default.moveItem(at: url, to: aside)
            return nil
        }
    }

    public func save(_ state: TerminalState) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        try encoder.encode(state).write(to: url, options: .atomic)
    }

    public func delete() {
        try? FileManager.default.removeItem(at: url)
    }
}
