import AppKit
import KeystoneCore
import SwiftUI

struct DirectoryView: View {
    @Environment(AppModel.self) private var model
    @State private var filter: RecordType?

    private let columns = [
        Column(title: "Code", width: 70), Column(title: "Type", width: 84), Column(title: "Name"),
        Column(title: "TIN", width: 130), Column(title: "Details", width: 260), Column(title: "Used by", width: 110),
    ]

    var body: some View {
        @Bindable var model = model
        let t = model.terminal
        let shown = filter.map { t.records($0) } ?? t.state.dir
        VStack(alignment: .leading, spacing: 16) {
            ScreenHeader(
                eyebrow: Destination.directory.section, title: "Directory",
                line: "\(Format.count(t.records(.vendor).count, "vendor")), \(Format.count(t.records(.client).count, "client")) and \(Format.count(t.records(.employee).count, "employee")). A vendor added here is available to vouchers, a client to billing, an employee to the ID maker."
            ) {
                Button("Add record") { model.addingRecord = true }.keystoneButton(.primary)
            }

            if model.addingRecord {
                AddRecordForm()
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }

            HStack(spacing: 8) {
                FilterChip(title: "All", count: t.state.dir.count, on: filter == nil) { filter = nil }
                ForEach(RecordType.allCases, id: \.self) { type in
                    FilterChip(title: type.rawValue + "s", count: t.records(type).count, on: filter == type) { filter = type }
                }
            }

            Register(title: "Master list", count: Format.count(shown.count, "record"), columns: columns, items: shown,
                     open: { _ in }) { d in
                DocNumber(d.code).cell(columns[0])
                Text(d.type.rawValue).foregroundStyle(P.ink2).cell(columns[1])
                Text(d.name).lineLimit(1).cell(columns[2])
                Text(d.tin.isEmpty ? "—" : d.tin).monospacedDigit().foregroundStyle(d.tin.isEmpty ? P.ink3 : P.ink2).cell(columns[3])
                Text(details(d)).foregroundStyle(P.ink2).lineLimit(1).cell(columns[4])
                HStack(spacing: 4) {
                    let used = t.usedBy(d.code)
                    if used.isEmpty { Text("—").foregroundStyle(P.ink3) }
                    ForEach(used, id: \.self) { ModuleTag(module: $0) }
                }
                .cell(columns[5])
            } actions: { d in
                Button("Copy code") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(d.code, forType: .string)
                }
                Button("Copy name") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(d.name, forType: .string)
                }
            }
        }
        .animation(.easeOut(duration: 0.18), value: model.addingRecord)
    }

    private func details(_ d: DirectoryRecord) -> String {
        var parts = [d.detail]
        if let dept = d.dept, !dept.isEmpty { parts.append(dept) }
        if d.type == .client { parts.append((d.vat == true ? "VAT" : "non-VAT") + (d.ewt == true ? ", EWT" : "")) }
        return parts.filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

/// A count chip in the attendance tracker's filter row. Selected: gold border and text.
private struct FilterChip: View {
    let title: String
    let count: Int
    let on: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(title).font(.poppins(12.5, .semibold))
                Text("\(count)")
                    .font(.poppins(11, .bold))
                    .monospacedDigit()
                    .padding(.horizontal, 6)
                    .padding(.vertical, 1)
                    .background(Capsule().fill(on ? P.gold : P.surface2))
                    .foregroundStyle(on ? P.goldInk : P.ink)
            }
            .foregroundStyle(on ? P.goldBright : P.ink2)
            .padding(.horizontal, 12)
            .frame(height: 30)
            .overlay(Capsule().strokeBorder(on ? P.gold : P.line))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isSelected] : [])
    }
}

private struct AddRecordForm: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Eyebrow("Directory entry")
                Text("Add record").font(.orbitron(15))
            }
            FieldRow {
                Field(label: "Type") {
                    MenuInput(selection: $model.newRecord.type, options: RecordType.allCases) { $0.rawValue }
                }
                Field(label: "Name") { TextInput(text: $model.newRecord.name) }
                Field(label: "TIN") { TextInput(placeholder: "000-000-000-000", text: $model.newRecord.tin, figures: true) }
            }
            FieldRow {
                Field(label: model.newRecord.type == .employee ? "Position" : "Address") {
                    TextInput(text: $model.newRecord.detail)
                }
                if model.newRecord.type == .employee {
                    Field(label: "Department") { TextInput(text: $model.newRecord.dept) }
                }
            }
            HStack(spacing: 8) {
                Text("Gets code \(model.terminal.nextCode(model.newRecord.type)).")
                    .font(.poppins(12)).foregroundStyle(P.ink2)
                Spacer()
                Button("Cancel") { model.addingRecord = false; model.newRecord = DirectoryDraft() }.keystoneButton()
                Button("Save record") { model.addRecord() }.keystoneButton(.primary)
            }
            .padding(.top, 12)
            .overlay(alignment: .top) { Rectangle().fill(P.line).frame(height: 1) }
        }
        .panel()
    }
}
