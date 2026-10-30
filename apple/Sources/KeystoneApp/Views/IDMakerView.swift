import KeystoneCore
import SwiftUI

struct IDMakerView: View {
    @Environment(AppModel.self) private var model

    private let columns = [
        Column(title: "ID No.", width: 130), Column(title: "Name"), Column(title: "Position", width: 180),
        Column(title: "Issued", width: 96), Column(title: "Valid until", width: 96),
        Column(title: "Status", width: 116, trailing: true),
    ]

    var body: some View {
        @Bindable var model = model
        let t = model.terminal
        let queued = t.queuedForPrinting
        VStack(alignment: .leading, spacing: 16) {
            ScreenHeader(
                eyebrow: Destination.idMaker.section, title: "ID Maker",
                line: queued.isEmpty
                    ? "No card is waiting to be printed. Pick an employee, attach a photo, and the card renders front and back."
                    : "\(Format.count(queued.count, "card")) waiting to be printed: \(queued.map(\.name).joined(separator: ", "))."
            ) {
                Button("Clear form") { model.clearCard() }.keystoneButton()
            }

            Register(title: "Issued IDs", count: Format.count(t.state.ids.count, "card"),
                     columns: columns, items: t.idsNewestFirst, open: model.load) { i in
                DocNumber(i.no).cell(columns[0])
                Text(i.name).lineLimit(1).cell(columns[1])
                Text(i.pos).foregroundStyle(P.ink2).lineLimit(1).cell(columns[2])
                Text(Format.short(i.issued)).monospacedDigit().foregroundStyle(P.ink2).cell(columns[3])
                Text(Format.short(i.valid)).monospacedDigit().foregroundStyle(P.ink2).cell(columns[4])
                StatusPill(text: i.status.rawValue, tone: i.status.tone).cell(columns[5])
            } actions: { i in
                ForEach(IDStatus.allCases, id: \.self) { s in
                    Button("Mark \(s.rawValue.lowercased())") { model.setStatus(i, s) }.disabled(i.status == s)
                }
            }

            Workspace(previewTitle: "Card preview", previewNote: "Front and back, CR80") {
                FormCard(eyebrow: "Card entry", title: "New ID", save: "Save and issue",
                         onSave: model.issueCard, onExport: model.exportCurrent, exportTitle: "Export print file") {
                    FieldRow {
                        Field(label: "ID No.") { ReadOnlyInput(text: model.card.no) }
                        Field(label: "Employee") {
                            MenuInput(selection: Binding(get: { model.card.emp }, set: { model.pickEmployee($0) }),
                                      options: [""] + t.records(.employee).map(\.code)) { code in
                                code.isEmpty ? "Type details by hand" : "\(t.name(code)) (\(code))"
                            }
                        }
                    }
                    Field(label: "Name on card") { TextInput(text: $model.card.name) }
                    FieldRow {
                        Field(label: "Position") { TextInput(text: $model.card.pos) }
                        Field(label: "Department") { TextInput(text: $model.card.dept) }
                    }
                    FieldRow {
                        Field(label: "Date issued") { DateInput(date: $model.card.issued) }
                        Field(label: "Valid until") { DateInput(date: $model.card.valid) }
                        Field(label: "Blood type") { MenuInput(selection: $model.card.blood, options: model.reference.bloodTypes) }
                    }
                    Field(label: "Photo") {
                        HStack(spacing: 10) {
                            Button(model.card.photo == nil ? "Choose photo…" : "Replace photo…") { model.choosePhoto() }
                                .keystoneButton(small: true)
                            if model.card.photo != nil {
                                Button("Remove") { model.card.photo = nil }.keystoneButton(.quiet, small: true)
                            }
                            Text("JPG or PNG. It is cropped square from the centre.")
                                .font(.poppins(12)).foregroundStyle(P.ink2)
                        }
                    }
                    FieldRow {
                        Field(label: "Emergency contact") { TextInput(placeholder: "Name", text: $model.card.iceName) }
                        Field(label: "Contact number") { TextInput(placeholder: "09XX XXX XXXX", text: $model.card.iceNo) }
                    }
                    Field(label: "Authorized signatory") { TextInput(text: $model.card.signatory) }
                }
            } preview: {
                CardSheet(card: model.card.record, photo: model.photo(model.card.photo), model: model)
                    .padding(18)
                    .frame(maxWidth: .infinity)
                    .background(RoundedRectangle(cornerRadius: Tokens.Radius.card).fill(P.surface))
                    .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.card).strokeBorder(P.line))
            }
        }
    }
}
