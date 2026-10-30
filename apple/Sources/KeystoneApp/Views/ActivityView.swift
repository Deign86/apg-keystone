import KeystoneCore
import SwiftUI

struct ActivityView: View {
    @Environment(AppModel.self) private var model
    @State private var module: Module?

    var body: some View {
        let log = model.terminal.state.log
        let shown = module.map { m in log.filter { $0.mod == m } } ?? log
        VStack(alignment: .leading, spacing: 16) {
            ScreenHeader(
                eyebrow: Destination.activity.section, title: "Activity Log",
                line: log.first.map { "\(Format.count(log.count, "entry", "entries")). The last was on \(Format.short(LocalDate(iso: $0.when)))." }
                    ?? "No activity yet. Every save, approval and issuance will be listed here."
            ) {
                Button("Reset sample data") { model.confirmingReset = true }.keystoneButton()
            }

            Picker("Module", selection: $module) {
                Text("All").tag(Module?.none)
                Text("Vouchers").tag(Module?.some(.voucher))
                Text("Billing").tag(Module?.some(.billing))
                Text("IDs").tag(Module?.some(.id))
                Text("Directory").tag(Module?.some(.directory))
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .frame(width: 420)

            ActivityFeed(entries: shown, compact: false).panel()
        }
    }
}

/// Time, module tag and what happened, one entry per line.
struct ActivityFeed: View {
    let entries: [LogEntry]
    let compact: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if entries.isEmpty {
                Text("No activity yet.").font(.poppins(13)).foregroundStyle(P.ink2).padding(.vertical, 10)
            }
            ForEach(Array(entries.enumerated()), id: \.offset) { i, e in
                Group {
                    if compact {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 8) {
                                ModuleTag(module: e.mod)
                                Text(e.when).font(.poppins(11.5)).monospacedDigit().foregroundStyle(P.ink3)
                            }
                            Text(e.text).font(.poppins(13)).fixedSize(horizontal: false, vertical: true)
                        }
                    } else {
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(e.when).font(.poppins(12)).monospacedDigit().foregroundStyle(P.ink3).frame(width: 120, alignment: .leading)
                            ModuleTag(module: e.mod)
                            Text(e.text).font(.poppins(13)).fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }
                    }
                }
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .top) { if i > 0 || compact { Rectangle().fill(P.line).frame(height: 1) } }
                .textSelection(.enabled)
            }
        }
    }
}
