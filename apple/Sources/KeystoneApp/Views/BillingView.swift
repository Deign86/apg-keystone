import KeystoneCore
import SwiftUI

struct BillingView: View {
    @Environment(AppModel.self) private var model

    private let columns = [
        Column(title: "BS No.", width: 120), Column(title: "Client"), Column(title: "Period", width: 170),
        Column(title: "Due", width: 96), Column(title: "Amount due", width: 124, trailing: true),
        Column(title: "Status", width: 96, trailing: true),
    ]

    var body: some View {
        @Bindable var model = model
        let t = model.terminal
        let open = t.outstanding
        VStack(alignment: .leading, spacing: 16) {
            ScreenHeader(
                eyebrow: Destination.billing.section, title: "Billing Statements",
                line: open.isEmpty
                    ? "Every statement is paid. VAT and withholding follow each client’s setup in the directory."
                    : "\(open.sum(\.totals.due).formatted) outstanding on \(Format.count(open.count, "statement")), \(t.overdue.count) overdue."
            ) {
                Button("Clear form") { model.clearStatement() }.keystoneButton()
            }

            Register(title: "Statements issued", count: Format.count(t.state.bs.count, "statement"),
                     columns: columns, items: t.statementsNewestFirst, open: model.load) { b in
                DocNumber(b.no).cell(columns[0])
                Text(t.name(b.client)).lineLimit(1).cell(columns[1])
                Text(b.period).foregroundStyle(P.ink2).lineLimit(1).cell(columns[2])
                Text(Format.short(b.due)).monospacedDigit().foregroundStyle(P.ink2).cell(columns[3])
                Amount(b.totals.due).cell(columns[4])
                StatusPill(text: b.status.rawValue, tone: b.status.tone).cell(columns[5])
            } actions: { b in
                ForEach(StatementStatus.allCases, id: \.self) { s in
                    Button("Mark \(s.rawValue.lowercased())") { model.setStatus(b, s) }.disabled(b.status == s)
                }
            }

            Workspace(previewTitle: "Document preview") {
                FormCard(eyebrow: "Statement entry", title: "New statement", save: "Save and mark as sent",
                         onSave: model.saveStatement, onExport: model.exportCurrent) {
                    FieldRow {
                        Field(label: "BS No.") { ReadOnlyInput(text: model.statement.no) }
                        Field(label: "Statement date") { DateInput(date: $model.statement.date) }
                        Field(label: "Due date") { DateInput(date: $model.statement.due) }
                    }
                    Field(label: "Bill to") {
                        MenuInput(selection: Binding(get: { model.statement.client }, set: { model.pickClient($0) }),
                                  options: t.records(.client).map(\.code)) { code in "\(t.name(code)) (\(code))" }
                    }
                    FieldRow {
                        Field(label: "Billing period") { TextInput(text: $model.statement.period) }
                        Field(label: "Contract / unit reference") {
                            TextInput(placeholder: "Lease No. L-2025-014", text: $model.statement.ref)
                        }
                    }
                    LineEditor(title: "Charges", lines: $model.statement.lines)
                    HStack(spacing: 18) {
                        Toggle("Add 12% VAT", isOn: $model.statement.vat).toggleStyle(GoldCheckbox())
                        Toggle("Less 5% expanded withholding tax", isOn: $model.statement.ewt).toggleStyle(GoldCheckbox())
                    }
                    let totals = model.statement.statement.totals
                    VStack(alignment: .trailing, spacing: 3) {
                        Text(breakdown(totals)).font(.poppins(12)).monospacedDigit().foregroundStyle(P.ink2)
                        Text(totals.due.formatted).font(.orbitron(18)).monospacedDigit().foregroundStyle(P.goldBright)
                    }
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    Field(label: "Payment instructions") { MultilineInput(text: $model.statement.notes) }
                }
            } preview: {
                StatementPaper(statement: model.statement.statement, model: model)
            }
        }
    }

    private func breakdown(_ t: StatementTotals) -> String {
        var s = "Subtotal \(t.subtotal.formatted)"
        if model.statement.vat { s += " · VAT \(t.vat.formatted)" }
        if model.statement.ewt { s += " · EWT (\(t.ewt.formatted))" }
        return s
    }
}
