import Foundation

// What the forms edit. A draft holds text exactly as typed; turning it into a record
// is where parsing and validation happen, so both platforms' forms stay thin.

public struct LineDraft: Identifiable, Hashable, Sendable {
    public let id: UUID
    public var desc: String
    public var acct: String
    public var ref: String
    public var amount: String

    public init(desc: String = "", acct: String = "", ref: String = "", amount: String = "") {
        self.id = UUID()
        self.desc = desc
        self.acct = acct
        self.ref = ref
        self.amount = amount
    }

    public init(_ line: LineItem) {
        self.init(desc: line.desc, acct: line.acct ?? "", ref: line.ref ?? "", amount: line.amt.editText)
    }

    var money: Money { Money(parsing: amount) ?? .zero }

    /// Blank lines (no description and no amount) are dropped, as in the prototype.
    var isBlank: Bool { desc.trimmingCharacters(in: .whitespaces).isEmpty && money == .zero }
}

extension [LineDraft] {
    func items(account: Bool) -> [LineItem] {
        filter { !$0.isBlank }.map {
            LineItem(desc: $0.desc, acct: account ? $0.acct : nil, ref: account ? nil : $0.ref, amt: $0.money)
        }
    }
}

public struct VoucherDraft: Hashable, Sendable {
    public var no: String
    public var date: LocalDate
    public var payee: String
    public var bank: String
    public var check: String
    public var lines: [LineDraft]
    public var prepared: String
    public var checked: String
    public var approved: String

    public var voucher: Voucher {
        Voucher(no: no, date: date, payee: payee, bank: bank, check: check, lines: lines.items(account: true),
                status: .forApproval, prepared: prepared, checked: checked, approved: approved)
    }
}

public struct StatementDraft: Hashable, Sendable {
    public var no: String
    public var date: LocalDate
    public var due: LocalDate
    public var client: String
    public var period: String
    public var ref: String
    public var lines: [LineDraft]
    public var vat: Bool
    public var ewt: Bool
    public var notes: String

    public var statement: Statement {
        Statement(no: no, date: date, due: due, client: client, period: period, ref: ref,
                  lines: lines.items(account: false), vat: vat, ewt: ewt, notes: notes, status: .sent)
    }
}

public struct IDDraft: Hashable, Sendable {
    public var no: String
    public var emp: String
    public var name: String
    public var pos: String
    public var dept: String
    public var issued: LocalDate
    public var valid: LocalDate
    public var blood: String
    public var iceName: String
    public var iceNo: String
    public var signatory: String
    public var photo: String?

    public var record: IDRecord {
        IDRecord(no: no, emp: emp, name: name.trimmingCharacters(in: .whitespaces), pos: pos, dept: dept,
                 issued: issued, valid: valid, blood: blood, iceName: iceName, iceNo: iceNo, signatory: signatory,
                 status: .forPrinting, photo: photo)
    }
}

public struct DirectoryDraft: Hashable, Sendable {
    public var type: RecordType = .vendor
    public var name = ""
    public var tin = ""
    public var detail = ""
    public var dept = ""

    public init() {}
}
