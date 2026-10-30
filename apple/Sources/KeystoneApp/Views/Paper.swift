import AppKit
import KeystoneCore
import SwiftUI
import UniformTypeIdentifiers

// The printed documents. They draw on white "paper" tokens with the same layout as the
// prototype's print preview, and the same views are rendered to PDF by PDFExport, so
// what is on screen is what gets printed.

private enum Ink {
    static let ink = P.paperInk
    static let muted = P.paperMuted
    static let line = P.paperLine
    static let rule = P.paperRule
    static let gold = P.paperGold
}

private struct Letterhead: View {
    let company: Company
    let title: String
    let no: String

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            HStack(spacing: 10) {
                Image(nsImage: AppResources.logo).resizable().interpolation(.high).frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 1) {
                    Text(company.name).font(.orbitron(12.5, .bold)).tracking(0.5).foregroundStyle(Ink.ink)
                    Text(company.address).font(.poppins(9.5)).foregroundStyle(Ink.muted).fixedSize(horizontal: false, vertical: true)
                    Text(company.contact).font(.poppins(9.5)).foregroundStyle(Ink.muted)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                Text(title.uppercased()).font(.orbitron(12.5, .semibold)).tracking(1.2).foregroundStyle(Ink.gold)
                Text(no).font(.poppins(11.5, .medium)).monospacedDigit().foregroundStyle(Ink.ink)
            }
            .fixedSize()
        }
        .padding(.bottom, 10)
        .overlay(alignment: .bottom) { Rectangle().fill(Ink.gold).frame(height: 2) }
        .padding(.bottom, 14)
    }
}

/// Two columns of label · value pairs on dotted lines.
private struct Meta: View {
    let pairs: [(String, String, Bool)]

    var body: some View {
        Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 4) {
            ForEach(Array(stride(from: 0, to: pairs.count, by: 2)), id: \.self) { i in
                GridRow {
                    pair(pairs[i])
                    if i + 1 < pairs.count { pair(pairs[i + 1]) } else { Color.clear.gridCellUnsizedAxes([.horizontal, .vertical]) }
                }
            }
        }
        .padding(.bottom, 12)
    }

    private func pair(_ p: (String, String, Bool)) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(p.0.uppercased()).font(.poppins(9, .medium)).tracking(0.4).foregroundStyle(Ink.muted)
                .frame(width: 84, alignment: .leading)
            Text(p.1).font(.poppins(11.5, p.2 ? .semibold : .regular)).monospacedDigit().foregroundStyle(Ink.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) {
            Line().stroke(Ink.line, style: StrokeStyle(lineWidth: 0.75, dash: [1, 2])).frame(height: 1)
        }
    }
}

private struct Line: Shape {
    func path(in rect: CGRect) -> Path {
        Path { $0.move(to: CGPoint(x: rect.minX, y: rect.midY)); $0.addLine(to: CGPoint(x: rect.maxX, y: rect.midY)) }
    }
}

/// Description · account or reference · amount, with footer rows.
private struct LinesTable: View {
    let middle: String
    let lines: [LineItem]
    let empty: String
    let footer: [(String, String, Bool)]
    let middleValue: (LineItem) -> String

    var body: some View {
        VStack(spacing: 0) {
            row(Text("DESCRIPTION"), Text(middle.uppercased()), Text("AMOUNT"), header: true)
                .overlay(alignment: .top) { Rectangle().fill(Ink.ink).frame(height: 1) }
                .overlay(alignment: .bottom) { Rectangle().fill(Ink.ink).frame(height: 1) }
            if lines.isEmpty {
                Text(empty).font(.poppins(11.5)).foregroundStyle(Ink.muted)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(6)
            }
            ForEach(Array(lines.enumerated()), id: \.offset) { _, l in
                row(Text(l.desc), Text(middleValue(l)).foregroundColor(Ink.muted), Text(l.amt.formatted), header: false)
                    .overlay(alignment: .bottom) { Rectangle().fill(Ink.rule).frame(height: 1) }
            }
            ForEach(Array(footer.enumerated()), id: \.offset) { i, f in
                let grand = i == footer.count - 1
                HStack {
                    Text(f.0)
                    Spacer()
                    Text(f.1).monospacedDigit()
                }
                .font(.poppins(grand ? 12.5 : 11.5, .semibold))
                .foregroundStyle(Ink.ink)
                .padding(.horizontal, 6)
                .padding(.vertical, 5)
                .overlay(alignment: .top) { if grand { Rectangle().fill(Ink.gold).frame(height: 2) } }
            }
        }
        .padding(.vertical, 8)
    }

    private func row(_ a: Text, _ b: Text, _ c: Text, header: Bool) -> some View {
        HStack(alignment: .top, spacing: 8) {
            a.frame(maxWidth: .infinity, alignment: .leading)
            b.frame(width: 150, alignment: .leading)
            c.monospacedDigit().frame(width: 110, alignment: .trailing)
        }
        .font(header ? .poppins(9, .semibold) : .poppins(11.5))
        .tracking(header ? 0.5 : 0)
        .foregroundStyle(Ink.ink)
        .padding(.horizontal, 6)
        .padding(.vertical, 5)
    }
}

private struct Signatures: View {
    let names: [(String, String)]

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ForEach(Array(names.enumerated()), id: \.offset) { _, n in
                VStack(alignment: .leading, spacing: 1) {
                    Text(n.0.isEmpty ? " " : n.0).font(.poppins(11, .semibold)).foregroundStyle(Ink.ink)
                    Text(n.1).font(.poppins(10)).foregroundStyle(Ink.muted)
                }
                .padding(.top, 4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .top) { Rectangle().fill(Ink.ink).frame(height: 1) }
            }
        }
        .padding(.top, 34)
    }
}

private struct Sheet<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .padding(.horizontal, 30)
            .padding(.vertical, 28)
            .frame(maxWidth: .infinity, minHeight: 420, alignment: .topLeading)
            .background(P.paper)
            .environment(\.colorScheme, .light)
    }
}

struct VoucherPaper: View {
    let voucher: Voucher
    let model: AppModel

    var body: some View {
        let payee = model.terminal.record(voucher.payee)
        let total = voucher.total
        Sheet {
            Letterhead(company: model.company, title: "Check Voucher", no: voucher.no)
            Meta(pairs: [
                ("Payee", payee?.name ?? "—", true), ("Date", Format.long(voucher.date), false),
                ("Address", payee?.detail.isEmpty == false ? payee!.detail : "—", false), ("TIN", payee?.tin.isEmpty == false ? payee!.tin : "—", false),
                ("Bank", voucher.bank, false), ("Check No.", voucher.check.isEmpty ? "________" : voucher.check, false),
            ])
            LinesTable(middle: "Account", lines: voucher.lines, empty: "No particulars yet.",
                       footer: [("Total", total.formatted, true)]) { $0.acct ?? "" }
            (Text("Amount in words: ").bold() + Text(AmountInWords.pesos(total)).italic())
                .font(.poppins(11.5))
                .foregroundStyle(Ink.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .overlay(Rectangle().strokeBorder(Ink.line))
                .padding(.vertical, 10)
            Signatures(names: [(voucher.prepared, "Prepared by"), (voucher.checked, "Checked by"),
                               (voucher.approved, "Approved by"), ("", "Received by / Date")])
            Text("Received from Alpha Premier Group the amount of \(total.formatted) in full payment of the above. Signature over printed name: ____________________ Date: __________")
                .font(.poppins(10))
                .foregroundStyle(Ink.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 10)
                .overlay(alignment: .top) {
                    Line().stroke(Ink.line, style: StrokeStyle(lineWidth: 1, dash: [4, 3])).frame(height: 1)
                }
                .padding(.top, 18)
        }
    }
}

struct StatementPaper: View {
    let statement: Statement
    let model: AppModel

    private var footer: [(String, String, Bool)] {
        let t = statement.totals
        var rows: [(String, String, Bool)] = [("Subtotal", t.subtotal.formatted, false)]
        if statement.vat { rows.append(("Add: 12% VAT", t.vat.formatted, false)) }
        if statement.ewt { rows.append(("Less: 5% expanded withholding tax (BIR Form 2307 to follow)", "(\(t.ewt.formatted))", false)) }
        rows.append(("Total amount due", t.due.formatted, true))
        return rows
    }

    var body: some View {
        let client = model.terminal.record(statement.client)
        Sheet {
            Letterhead(company: model.company, title: "Billing Statement", no: statement.no)
            Meta(pairs: [
                ("Bill to", client?.name ?? "—", true), ("Statement date", Format.long(statement.date), false),
                ("Address", client?.detail.isEmpty == false ? client!.detail : "—", false), ("Due date", Format.long(statement.due), true),
                ("TIN", client?.tin.isEmpty == false ? client!.tin : "—", false), ("Period", statement.period.isEmpty ? "—" : statement.period, false),
                ("Reference", statement.ref.isEmpty ? "—" : statement.ref, false), ("Terms", model.reference.defaults.billingTerms, false),
            ])
            LinesTable(middle: "Reference", lines: statement.lines, empty: "No charges yet.", footer: footer) { $0.ref ?? "" }
            Text(statement.notes ?? "")
                .font(.poppins(10.5))
                .foregroundStyle(Ink.muted)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12)
            Signatures(names: [("Accounting", "Prepared by"), ("", "Received by / Date")])
                .frame(maxWidth: 420, alignment: .leading)
        }
    }
}

// MARK: ID card

/// Front and back side by side.
struct CardSheet: View {
    let card: IDRecord
    let photo: NSImage?
    let model: AppModel

    var body: some View {
        HStack(spacing: 16) {
            CardFront(card: card, photo: photo)
            CardBack(card: card, company: model.company)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct CardFrame<Content: View>: View {
    var fill = P.cardBg
    @ViewBuilder var content: Content

    var body: some View {
        content
            .frame(width: Tokens.Layout.idCardWidth, height: Tokens.Layout.idCardHeight, alignment: .top)
            .background(fill)
            .overlay(alignment: .bottom) {
                // The one gradient in the app: the printed card's foil stripe, kept from the
                // existing APG ID design.
                LinearGradient(colors: [P.goldBright, P.gold, P.goldSoft], startPoint: .leading, endPoint: .trailing)
                    .frame(height: 5)
            }
            .clipShape(RoundedRectangle(cornerRadius: Tokens.Radius.idCard))
            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.idCard).strokeBorder(P.line))
            .foregroundStyle(P.ink)
    }
}

private struct CardFront: View {
    let card: IDRecord
    let photo: NSImage?

    var body: some View {
        CardFrame {
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Image(nsImage: AppResources.logo).resizable().interpolation(.high).frame(width: 26, height: 26)
                    VStack(alignment: .leading, spacing: 1) {
                        (Text("ALPHA PREMIER ") + Text("GROUP").foregroundColor(P.goldBright))
                            .font(.orbitron(8.5, .bold))
                        Text("EMPLOYEE IDENTIFICATION").font(.poppins(7.5)).tracking(0.9).foregroundStyle(P.ink2)
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 14)
                .padding(.top, 14)
                .padding(.bottom, 10)
                .overlay(alignment: .bottom) { Rectangle().fill(P.line).frame(height: 1) }

                Group {
                    if let photo {
                        Image(nsImage: photo).resizable().scaledToFill()
                    } else {
                        Text("2×2 photo").font(.poppins(10.5)).foregroundStyle(P.ink3)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .background(P.surface2)
                    }
                }
                .frame(width: 118, height: 118)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(P.gold, lineWidth: 2))
                .padding(.top, 16)
                .padding(.bottom, 10)

                Text(card.name.isEmpty ? "Employee name" : card.name)
                    .font(.orbitron(12))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .padding(.horizontal, 10)
                Text(card.pos.isEmpty ? "Position" : card.pos)
                    .font(.poppins(10.5, .semibold)).foregroundStyle(P.goldBright).padding(.top, 4)
                Text(card.dept).font(.poppins(9.5)).foregroundStyle(P.ink2)
                Spacer(minLength: 0)
                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 0) {
                        Text("ID NO.").font(.poppins(7.5)).tracking(0.7).foregroundStyle(P.ink3)
                        Text(card.no).font(.poppins(10, .medium)).monospacedDigit()
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 0) {
                        Text("VALID UNTIL").font(.poppins(7.5)).tracking(0.7).foregroundStyle(P.ink3)
                        Text(Format.short(card.valid)).font(.poppins(10, .medium)).monospacedDigit()
                    }
                }
                .foregroundStyle(P.goldBright)
                .padding(.horizontal, 14)
                .padding(.bottom, 14)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("ID card front for \(card.name)")
    }
}

private struct CardBack: View {
    let card: IDRecord
    let company: Company

    var body: some View {
        CardFrame(fill: P.cardBack) {
            VStack(spacing: 0) {
                Rectangle().fill(.black).frame(height: 34).padding(.top, 18)
                VStack(alignment: .leading, spacing: 3) {
                    heading("Emergency contact")
                    Text("\(card.iceName.isEmpty ? "—" : card.iceName)\(card.iceNo.isEmpty ? "" : " · " + card.iceNo)\nBlood type: \(card.blood)")
                        .foregroundStyle(P.ink)
                        .padding(.bottom, 5)
                    heading("If found")
                    Text("Please return to Alpha Premier Group, \(company.shortAddress), or call \(company.phone). This card is company property and must be surrendered upon separation.")
                        .foregroundStyle(P.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .font(.poppins(8.5))
                .lineSpacing(1)
                .padding(.horizontal, 14)
                .padding(.top, 10)
                .frame(maxWidth: .infinity, alignment: .leading)

                VerificationPattern(text: VerificationCode.seed(no: card.no, name: card.name))
                    .frame(width: 64, height: 64)
                    .padding(3)
                    .background(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 3))
                    .padding(.top, 4)
                    .accessibilityLabel("Verification pattern")

                VStack(spacing: 0) {
                    Text(card.signatory).font(.poppins(9, .semibold)).foregroundStyle(P.ink)
                    Text("Authorized signature").font(.poppins(8)).foregroundStyle(P.ink3)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 3)
                .overlay(alignment: .top) { Rectangle().fill(P.gold).frame(height: 1) }
                .padding(.horizontal, 14)
                .padding(.top, 8)
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func heading(_ s: String) -> some View {
        Text(s.uppercased()).font(.poppins(8, .semibold)).tracking(0.8).foregroundStyle(P.gold)
    }
}

/// Draws the 21×21 pattern from KeystoneCore.
struct VerificationPattern: View {
    let text: String

    var body: some View {
        let cells = VerificationCode.cells(for: text)
        Canvas { ctx, size in
            let n = CGFloat(VerificationCode.size)
            let s = min(size.width, size.height) / n
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.white))
            for (y, row) in cells.enumerated() {
                for (x, dark) in row.enumerated() where dark {
                    ctx.fill(Path(CGRect(x: CGFloat(x) * s, y: CGFloat(y) * s, width: s, height: s)),
                             with: .color(Color(white: 0.067)))
                }
            }
        }
    }
}

// MARK: PDF

@MainActor
enum PDFExport {
    /// A4 width in points; the height follows the document.
    static let pageWidth: CGFloat = 595

    static func save<V: View>(_ view: V, named name: String, model: AppModel) {
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.pdf]
        panel.nameFieldStringValue = name
        guard panel.runModal() == .OK, let url = panel.url else { return }
        do {
            try write(view, to: url)
            model.show("Saved \(url.lastPathComponent).")
            NSWorkspace.shared.activateFileViewerSelecting([url])
        } catch {
            model.show("Could not export: \(error.localizedDescription)")
        }
    }

    static func write<V: View>(_ view: V, to url: URL) throws {
        let renderer = ImageRenderer(content: view.frame(width: pageWidth).background(P.paper).environment(\.colorScheme, .light))
        renderer.proposedSize = ProposedViewSize(width: pageWidth, height: nil)
        var failure: Error?
        renderer.render { size, draw in
            var box = CGRect(origin: .zero, size: size)
            guard let consumer = CGDataConsumer(url: url as CFURL),
                  let pdf = CGContext(consumer: consumer, mediaBox: &box, nil) else {
                failure = KeystoneError("The PDF file could not be created.")
                return
            }
            pdf.beginPDFPage(nil)
            draw(pdf)
            pdf.endPDFPage()
            pdf.closePDF()
        }
        if let failure { throw failure }
    }
}
