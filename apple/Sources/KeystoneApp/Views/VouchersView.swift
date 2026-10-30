import KeystoneCore
import SwiftUI

struct VouchersView: View {
    @Environment(AppModel.self) private var model

    private let columns = [
        Column(title: "CV No.", width: 120), Column(title: "Date", width: 96), Column(title: "Payee"),
        Column(title: "Bank / Check", width: 150), Column(title: "Amount", width: 120, trailing: true),
        Column(title: "Status", width: 116, trailing: true),
    ]

    var body: some View {
        @Bindable var model = model
        let t = model.terminal
        let pending = t.awaitingApproval
        VStack(alignment: .leading, spacing: 16) {
            ScreenHeader(
                eyebrow: Destination.vouchers.section, title: "Check Vouchers",
                line: pending.isEmpty
                    ? "Every voucher is signed. Record a disbursement and route it for signatures."
                    : "\(Format.count(pending.count, "voucher")) worth \(pending.sum(\.total).formatted) \(pending.count == 1 ? "waits" : "wait") for approval."
            ) {
                Button("Clear form") { model.clearVoucher() }.keystoneButton()
            }

            Register(title: "Voucher register", count: Format.count(t.state.cv.count, "voucher"),
                     columns: columns, items: t.vouchersNewestFirst, open: model.load) { v in
                DocNumber(v.no).cell(columns[0])
                Text(Format.short(v.date)).monospacedDigit().foregroundStyle(P.ink2).cell(columns[1])
                Text(t.name(v.payee)).lineLimit(1).cell(columns[2])
                HStack(spacing: 6) {
                    Text(v.check.isEmpty ? "—" : v.check).monospacedDigit()
                    Text(v.bank.components(separatedBy: " –").first ?? "").foregroundStyle(P.ink2)
                }
                .lineLimit(1).cell(columns[3])
                Amount(v.total).cell(columns[4])
                StatusPill(text: v.status.rawValue, tone: v.status.tone).cell(columns[5])
            } actions: { v in
                ForEach(VoucherStatus.allCases, id: \.self) { s in
                    Button("Mark \(s.rawValue.lowercased())") { model.setStatus(v, s) }.disabled(v.status == s)
                }
            }

            Workspace(previewTitle: "Document preview") {
                FormCard(eyebrow: "Voucher entry", title: "New voucher", save: "Save and route for approval",
                         onSave: model.saveVoucher, onExport: model.exportCurrent) {
                    FieldRow {
                        Field(label: "CV No.") { ReadOnlyInput(text: model.voucher.no) }
                        Field(label: "Date") { DateInput(date: $model.voucher.date) }
                    }
                    Field(label: "Payee") {
                        MenuInput(selection: $model.voucher.payee, options: t.payees.map(\.code)) { code in
                            "\(t.name(code)) (\(code))"
                        }
                    }
                    FieldRow {
                        Field(label: "Bank account") { MenuInput(selection: $model.voucher.bank, options: model.reference.banks) }
                        Field(label: "Check No.") { TextInput(placeholder: "0004512", text: $model.voucher.check, figures: true) }
                    }
                    LineEditor(title: "Particulars", lines: $model.voucher.lines, accounts: model.reference.accounts)
                    let total = model.voucher.voucher.total
                    VStack(alignment: .trailing, spacing: 3) {
                        Text(total.formatted).font(.orbitron(18)).monospacedDigit().foregroundStyle(P.goldBright)
                        Text(AmountInWords.pesos(total)).font(.poppins(12)).foregroundStyle(P.ink2).multilineTextAlignment(.trailing)
                    }
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    FieldRow {
                        Field(label: "Prepared by") { TextInput(text: $model.voucher.prepared) }
                        Field(label: "Checked by") { TextInput(text: $model.voucher.checked) }
                        Field(label: "Approved by") { TextInput(text: $model.voucher.approved) }
                    }
                }
            } preview: {
                VoucherPaper(voucher: model.voucher.voucher, model: model)
            }
        }
    }
}
