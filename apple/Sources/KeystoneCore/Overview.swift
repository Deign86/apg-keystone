import Foundation

/// One figure in the overview strip: a label, the value, and the line that says what it counts.
public struct Figure: Hashable, Sendable {
    public let label: String
    public let value: String
    public let caption: String
}

/// The destinations of the app, in rail order. Each platform maps `icon` to its own glyph set.
public enum Destination: String, CaseIterable, Identifiable, Sendable {
    case home, overview, vouchers, billing, idMaker, directory, activity

    public var id: String { rawValue }

    /// The number key that opens it (⌘0–⌘6 on the Mac, Ctrl+0–6 on Windows), as in the prototype.
    public var key: Int { Self.allCases.firstIndex(of: self)! }

    public var title: String {
        switch self {
        case .home: "Home"
        case .overview: "Overview"
        case .vouchers: "Check Vouchers"
        case .billing: "Billing Statements"
        case .idMaker: "ID Maker"
        case .directory: "Directory"
        case .activity: "Activity Log"
        }
    }

    /// The line on its home-screen tile.
    public var blurb: String {
        switch self {
        case .home: ""
        case .overview: "Summary figures for the CEO: pending approvals, receivables, and IDs issued this month."
        case .vouchers: "Prepare disbursement vouchers, generate the amount in words, and route them for signatures."
        case .billing: "Issue statements of account with VAT and withholding computed from each client’s setup."
        case .idMaker: "Pick a person, add a photo, and print the card front and back."
        case .directory: "One master list of vendors, clients, and employees shared by every system."
        case .activity: "Every save, approval, and issuance across the terminal, kept as the audit trail."
        }
    }

    /// Eyebrow over the screen title.
    public var section: String {
        switch self {
        case .home: "Administrator access"
        case .overview: "Administrator access"
        case .vouchers: "Disbursements"
        case .billing: "Receivables"
        case .idMaker: "Employee IDs"
        case .directory: "Master data"
        case .activity: "Audit trail"
        }
    }
}

extension Terminal {
    public var awaitingApproval: [Voucher] { state.cv.filter { $0.status == .forApproval } }
    public var outstanding: [Statement] { state.bs.filter { $0.status != .paid } }
    public var overdue: [Statement] { state.bs.filter { $0.status == .overdue } }
    public var queuedForPrinting: [IDRecord] { state.ids.filter { $0.status == .forPrinting } }
    public var issuedThisMonth: [IDRecord] { state.ids.filter { $0.issued.monthKey == clock.today.monthKey } }

    public var overviewFigures: [Figure] {
        let pending = awaitingApproval
        let open = outstanding
        return [
            Figure(label: "Vouchers awaiting approval", value: "\(pending.count)",
                   caption: "\(pending.sum(\.total).formatted) pending signature"),
            Figure(label: "Receivables outstanding", value: open.sum(\.totals.due).formatted,
                   caption: "\(Format.count(open.count, "statement")) open · \(overdue.count) overdue"),
            Figure(label: "IDs issued this month", value: "\(issuedThisMonth.count)",
                   caption: "\(queuedForPrinting.count) queued for printing"),
            Figure(label: "Directory records", value: "\(state.dir.count)",
                   caption: "\(Format.count(records(.vendor).count, "vendor")) · \(Format.count(records(.client).count, "client")) · \(Format.count(records(.employee).count, "employee"))"),
        ]
    }

    /// The one thing on the books that most needs attention, said in a sentence.
    public var finding: String {
        if let worst = overdue.max(by: { $0.totals.due < $1.totals.due }) {
            let more = overdue.count > 1 ? " One of \(overdue.count) overdue statements." : ""
            return "\(worst.totals.due.formatted) from \(name(worst.client)) has been overdue since \(Format.short(worst.due)).\(more)"
        }
        let pending = awaitingApproval
        if !pending.isEmpty {
            return "\(Format.count(pending.count, "voucher")) worth \(pending.sum(\.total).formatted) \(pending.count == 1 ? "waits" : "wait") for approval."
        }
        if !queuedForPrinting.isEmpty {
            return "\(Format.count(queuedForPrinting.count, "ID")) \(queuedForPrinting.count == 1 ? "is" : "are") waiting to be printed."
        }
        return "Nothing is waiting on you. Every voucher is signed and every statement is settled."
    }

    /// The figure on each home tile: (label, value).
    public func tileStat(_ d: Destination) -> (String, String) {
        switch d {
        case .home: ("", "")
        case .overview: ("Open items", "\(awaitingApproval.count + outstanding.count)")
        case .vouchers: ("Awaiting approval", "\(awaitingApproval.count)")
        case .billing: ("Outstanding", outstanding.sum(\.totals.due).formatted)
        case .idMaker: ("Queued for printing", "\(queuedForPrinting.count)")
        case .directory: ("Records", "\(state.dir.count)")
        case .activity: ("Last entry", state.log.first.map { Format.short(LocalDate(iso: $0.when)) } ?? "—")
        }
    }
}
