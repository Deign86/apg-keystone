import AppKit
import KeystoneCore
import SwiftUI

@main
struct KeystoneApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var model = AppModel()

    init() {
        AppResources.registerFonts()
    }

    var body: some Scene {
        Window("Keystone", id: "main") {
            RootView()
                .environment(model)
                .frame(minWidth: 1100, minHeight: 720)
                .preferredColorScheme(.dark)
                .tint(P.gold)
        }
        .defaultSize(width: 1440, height: 900)
        .commands { KeystoneCommands(model: model) }

        Settings {
            SettingsView()
                .preferredColorScheme(.dark)
                .tint(P.gold)
        }
    }
}

private struct KeystoneCommands: Commands {
    let model: AppModel

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("New Check Voucher") { model.clearVoucher(); model.go(.vouchers) }
                .keyboardShortcut("n")
            Button("New Billing Statement") { model.clearStatement(); model.go(.billing) }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            Button("New ID") { model.clearCard(); model.go(.idMaker) }
                .keyboardShortcut("n", modifiers: [.command, .option])
        }
        CommandGroup(replacing: .saveItem) {
            Button("Save") { model.saveCurrent() }
                .keyboardShortcut("s")
            Button("Export PDF…") { model.exportCurrent() }
                .keyboardShortcut("e")
        }
        CommandMenu("Go") {
            ForEach(Destination.allCases) { d in
                Button(d.title) { model.go(d) }
                    .keyboardShortcut(KeyEquivalent(Character("\(d.key)")))
            }
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Run from `swift run` or Xcode as a bare executable, the app would otherwise
        // start without a Dock icon or focus.
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        NSApp.applicationIconImage = AppResources.logo
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

/// Settings (⌘,): where the connected apps live on this office's network.
struct SettingsView: View {
    @AppStorage("attendanceAddress") private var attendanceAddress = ""

    var body: some View {
        Form {
            Section {
                TextField("Attendance dashboard", text: $attendanceAddress, prompt: Text("192.168.1.20:8787"))
                Text("The address of the attendance tracker’s live dashboard on the office network. Home › Attendance Tracker opens it in your browser.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } header: {
                Text("Connected apps")
            }
        }
        .formStyle(.grouped)
        .frame(width: 480)
        .padding(.vertical, 8)
    }
}
