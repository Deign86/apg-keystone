import KeystoneCore
import SwiftUI

/// A register column. `width: nil` takes the remaining space (the identity column).
struct Column {
    let title: String
    var width: CGFloat?
    var trailing = false
}

extension View {
    func cell(_ c: Column) -> some View {
        frame(minWidth: c.width, maxWidth: c.width ?? .infinity, alignment: c.trailing ? .trailing : .leading)
    }
}

/// A list of records: gold capitals for the header, rows on a 45pt pitch split by 1px
/// lines, figures right-aligned. Clicking a row loads it into the form; the trailing
/// menu changes its status.
struct Register<Item: Identifiable, Row: View, Actions: View>: View {
    let title: String
    let count: String
    let columns: [Column]
    let items: [Item]
    var empty = "Nothing here yet."
    var open: (Item) -> Void
    @ViewBuilder var row: (Item) -> Row
    @ViewBuilder var actions: (Item) -> Actions

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                SectionLabel(title)
                Spacer()
                Text(count).font(.poppins(12)).foregroundStyle(P.ink2)
            }
            .padding(.bottom, 10)

            HStack(spacing: 12) {
                ForEach(Array(columns.enumerated()), id: \.offset) { _, c in
                    Text(c.title.uppercased())
                        .font(.poppins(10.5, .bold))
                        .tracking(0.8)
                        .foregroundStyle(P.gold)
                        .lineLimit(1)
                        .cell(c)
                }
                Color.clear.frame(width: 28)
            }
            .padding(.horizontal, 10)
            .frame(height: 34)

            if items.isEmpty {
                Text(empty)
                    .font(.poppins(13))
                    .foregroundStyle(P.ink2)
                    .frame(maxWidth: .infinity, minHeight: 45, alignment: .leading)
                    .padding(.horizontal, 10)
                    .overlay(alignment: .top) { Rectangle().fill(P.line).frame(height: 1) }
            }
            ForEach(items) { item in
                RegisterRow(open: { open(item) }) {
                    row(item)
                } actions: {
                    actions(item)
                }
            }
        }
        .panel()
    }
}

private struct RegisterRow<Content: View, Actions: View>: View {
    let open: () -> Void
    @ViewBuilder var content: Content
    @ViewBuilder var actions: Actions
    @State private var hover = false

    var body: some View {
        HStack(spacing: 12) {
            Button(action: open) {
                HStack(spacing: 12) { content }
                    .font(.poppins(13))
                    .frame(minHeight: 45)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("Load into the form")

            Menu {
                actions
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(hover ? P.goldBright : P.ink3)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .frame(width: 28)
            .accessibilityLabel("Change status")
        }
        .padding(.horizontal, 10)
        .background(RoundedRectangle(cornerRadius: 4).fill(hover ? P.surface2 : .clear))
        .overlay(alignment: .top) { Rectangle().fill(P.line).frame(height: 1) }
        .onHover { hover = $0 }
    }
}

/// The record's number, in gold figures.
struct DocNumber: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text).font(.poppins(13, .semibold)).monospacedDigit().foregroundStyle(P.goldBright).lineLimit(1)
    }
}

/// An amount in a register: right-aligned tabular figures in full ink.
struct Amount: View {
    let money: Money
    init(_ money: Money) { self.money = money }

    var body: some View {
        Text(money.formatted).font(.poppins(13, .semibold)).monospacedDigit().foregroundStyle(P.ink).lineLimit(1)
    }
}

/// Description, account or reference, amount, remove: the line editor of the voucher and
/// statement forms.
struct LineEditor: View {
    let title: String
    @Binding var lines: [LineDraft]
    /// Chart of accounts for vouchers; nil gives a free "Reference" field instead.
    var accounts: [String]?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(title).font(.poppins(12.5, .medium))
                Spacer()
                Button {
                    lines.append(LineDraft(acct: accounts?.first ?? ""))
                } label: {
                    Label("Add line", systemImage: "plus").labelStyle(.titleOnly)
                }
                .keystoneButton(small: true)
            }
            ForEach($lines) { $line in
                HStack(spacing: 6) {
                    TextInput(placeholder: "Description", text: $line.desc)
                        .frame(maxWidth: .infinity)
                    Group {
                        if let accounts {
                            MenuInput(selection: $line.acct, options: accounts)
                        } else {
                            TextInput(placeholder: "Reference", text: $line.ref)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .layoutPriority(-1)
                    TextInput(placeholder: "0.00", text: $line.amount, alignment: .trailing)
                        .frame(width: 120)
                    Button {
                        lines.removeAll { $0.id == line.id }
                    } label: {
                        Image(systemName: "xmark").font(.system(size: 11, weight: .semibold))
                            .frame(width: 28, height: 28)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(P.ink3)
                    .accessibilityLabel("Remove line")
                    .disabled(lines.count == 1)
                }
            }
        }
    }
}

/// The two-column working area: the form on the left, the printed document on the right.
/// Below 1100pt of content width they stack.
struct Workspace<Form: View, Preview: View>: View {
    let previewTitle: String
    var previewNote = "Updates as you type"
    @ViewBuilder var form: Form
    @ViewBuilder var preview: Preview

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 16) {
                form.frame(minWidth: 400, maxWidth: .infinity)
                    .layoutPriority(5)
                previewColumn.frame(minWidth: 520, maxWidth: .infinity)
                    .layoutPriority(6)
            }
            VStack(alignment: .leading, spacing: 16) {
                form
                previewColumn
            }
        }
    }

    private var previewColumn: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                SectionLabel(previewTitle)
                Spacer()
                Text(previewNote).font(.poppins(12)).foregroundStyle(P.ink2)
            }
            preview
        }
    }
}

/// The form card's heading and its save row.
struct FormCard<Content: View>: View {
    let eyebrow: String
    let title: String
    let save: String
    let onSave: () -> Void
    let onExport: () -> Void
    var exportTitle = "Export PDF"
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Eyebrow(eyebrow)
                Text(title).font(.orbitron(15)).accessibilityAddTraits(.isHeader)
            }
            content
            HStack(spacing: 8) {
                Spacer()
                Button(exportTitle, action: onExport).keystoneButton()
                Button(save, action: onSave).keystoneButton(.primary)
            }
            .padding(.top, 12)
            .overlay(alignment: .top) { Rectangle().fill(P.line).frame(height: 1) }
        }
        .panel()
    }
}
