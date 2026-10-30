import Foundation

// The JSON keys below are the prototype's localStorage schema, kept as-is so a saved
// state moves between the web prototype, the Mac app and the Windows app unchanged.

public enum RecordType: String, Codable, CaseIterable, Sendable {
    case vendor = "Vendor"
    case client = "Client"
    case employee = "Employee"

    public var codePrefix: String {
        switch self {
        case .vendor: "V-"
        case .client: "C-"
        case .employee: "E-"
        }
    }

    /// The module that becomes able to use a new record of this type.
    public var usedIn: String {
        switch self {
        case .vendor: "Check Vouchers"
        case .client: "Billing Statements"
        case .employee: "the ID Maker"
        }
    }
}

public struct DirectoryRecord: Codable, Hashable, Identifiable, Sendable {
    public var code: String
    public var type: RecordType
    public var name: String
    public var tin: String
    /// Address for vendors and clients, position for employees.
    public var detail: String
    public var dept: String?
    /// Clients only: whether statements add 12% VAT and deduct 5% EWT by default.
    public var vat: Bool?
    public var ewt: Bool?

    public var id: String { code }

    public init(code: String, type: RecordType, name: String, tin: String = "", detail: String = "",
                dept: String? = nil, vat: Bool? = nil, ewt: Bool? = nil) {
        self.code = code
        self.type = type
        self.name = name
        self.tin = tin
        self.detail = detail
        self.dept = dept
        self.vat = vat
        self.ewt = ewt
    }
}

/// One line on a voucher (`acct`) or a statement (`ref`).
public struct LineItem: Codable, Hashable, Sendable {
    public var desc: String
    public var acct: String?
    public var ref: String?
    public var amt: Money

    public init(desc: String, acct: String? = nil, ref: String? = nil, amt: Money) {
        self.desc = desc
        self.acct = acct
        self.ref = ref
        self.amt = amt
    }
}

public enum Tone: Sendable {
    case good, warn, bad, neutral
}

public enum VoucherStatus: String, Codable, CaseIterable, Sendable {
    case forApproval = "For Approval"
    case approved = "Approved"
    case released = "Released"

    public var tone: Tone {
        switch self {
        case .forApproval: .warn
        case .approved: .good
        case .released: .neutral
        }
    }
}

public enum StatementStatus: String, Codable, CaseIterable, Sendable {
    case sent = "Sent"
    case paid = "Paid"
    case overdue = "Overdue"

    public var tone: Tone {
        switch self {
        case .sent: .neutral
        case .paid: .good
        case .overdue: .bad
        }
    }
}

public enum IDStatus: String, Codable, CaseIterable, Sendable {
    case forPrinting = "For printing"
    case active = "Active"
    case expired = "Expired"

    public var tone: Tone {
        switch self {
        case .forPrinting: .warn
        case .active: .good
        case .expired: .bad
        }
    }
}

public struct Voucher: Codable, Hashable, Identifiable, Sendable {
    public var no: String
    public var date: LocalDate
    /// Directory code of the payee.
    public var payee: String
    public var bank: String
    public var check: String
    public var lines: [LineItem]
    public var status: VoucherStatus
    public var prepared: String
    public var checked: String
    public var approved: String

    public var id: String { no }
    public var total: Money { lines.sum(\.amt) }
}

public struct StatementTotals: Hashable, Sendable {
    public var subtotal: Money
    public var vat: Money
    public var ewt: Money
    public var due: Money
}

public struct Statement: Codable, Hashable, Identifiable, Sendable {
    public var no: String
    public var date: LocalDate
    public var due: LocalDate
    /// Directory code of the client.
    public var client: String
    public var period: String
    public var ref: String
    public var lines: [LineItem]
    public var vat: Bool
    public var ewt: Bool
    public var notes: String?
    public var status: StatementStatus

    public var id: String { no }

    public static let vatRate = 12
    public static let ewtRate = 5

    /// VAT is added and EWT withheld, both on the subtotal.
    public var totals: StatementTotals {
        let sub = lines.sum(\.amt)
        let v = vat ? sub.percent(Self.vatRate) : .zero
        let w = ewt ? sub.percent(Self.ewtRate) : .zero
        return StatementTotals(subtotal: sub, vat: v, ewt: w, due: sub + v - w)
    }
}

public struct IDRecord: Codable, Hashable, Identifiable, Sendable {
    public var no: String
    /// Directory code of the employee, or "" when typed in by hand.
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
    public var status: IDStatus
    /// File name of the card photo inside the app's photo folder.
    public var photo: String?

    public var id: String { no }
}

public enum Module: String, Codable, CaseIterable, Sendable {
    case voucher = "CV"
    case billing = "BS"
    case id = "ID"
    case directory = "DIR"
}

public struct LogEntry: Codable, Hashable, Sendable {
    /// Local time as "yyyy-MM-dd HH:mm".
    public var when: String
    public var mod: Module
    public var text: String
}

/// Everything the app saves. One JSON file on both platforms.
public struct TerminalState: Codable, Equatable, Sendable {
    public var dir: [DirectoryRecord]
    public var cv: [Voucher]
    public var bs: [Statement]
    public var ids: [IDRecord]
    public var log: [LogEntry]
}

public struct Company: Codable, Hashable, Sendable {
    public var name: String
    public var address: String
    public var contact: String
    public var shortAddress: String
    public var phone: String
    public var billingEmail: String
}

public struct Defaults: Codable, Hashable, Sendable {
    public var preparedBy: String
    public var checkedBy: String
    public var approvedBy: String
    public var billingPeriod: String
    public var paymentInstructions: String
    public var signatory: String
    public var billingTerms: String
    public var dueInDays: Int
    public var idValidYears: Int
}

public struct ReferenceData: Codable, Hashable, Sendable {
    public var accounts: [String]
    public var banks: [String]
    public var bloodTypes: [String]
    public var defaults: Defaults
}

/// shared/data/seed.json
public struct Seed: Codable, Sendable {
    public var company: Company
    public var reference: ReferenceData
    public var state: TerminalState

    public static let bundled: Seed = {
        do {
            return try JSONDecoder().decode(Seed.self, from: Data(SeedData.json.utf8))
        } catch {
            fatalError("shared/data/seed.json does not decode: \(error)")
        }
    }()
}
