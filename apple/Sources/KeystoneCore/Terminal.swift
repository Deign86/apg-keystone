import Foundation

/// A refusal with the sentence to show the person.
public struct KeystoneError: Error, Equatable, LocalizedError {
    public let message: String
    public init(_ message: String) { self.message = message }
    public var errorDescription: String? { message }
}

/// The record that was saved and the confirmation to show.
public struct Saved<Record> {
    public let record: Record
    public let message: String
}

/// Where "now" comes from, so tests can pin the date.
public struct Clock: Sendable {
    public var now: @Sendable () -> Date
    public var calendar: Calendar

    public init(now: @escaping @Sendable () -> Date = { Date() }, calendar: Calendar = .current) {
        self.now = now
        self.calendar = calendar
    }

    public var today: LocalDate { LocalDate(now(), timeZone: calendar.timeZone) }
    public var stamp: String { Format.stamp(now(), calendar: calendar) }
}

/// Every rule of the terminal: numbering, defaults, saving, the activity log and the
/// figures on the home and overview screens. The UI on each platform only draws this.
public struct Terminal: Sendable {
    public var state: TerminalState
    public let seed: Seed
    public var clock: Clock

    public init(state: TerminalState? = nil, seed: Seed = .bundled, clock: Clock = Clock()) {
        self.seed = seed
        self.state = state ?? seed.state
        self.clock = clock
    }

    public var company: Company { seed.company }
    public var reference: ReferenceData { seed.reference }
    private var defaults: Defaults { seed.reference.defaults }

    // MARK: Lookups

    public func record(_ code: String) -> DirectoryRecord? { state.dir.first { $0.code == code } }

    public func records(_ type: RecordType) -> [DirectoryRecord] { state.dir.filter { $0.type == type } }

    public func name(_ code: String) -> String { record(code)?.name ?? code }

    /// Vouchers can pay anyone in the directory: vendors first, then clients, then employees.
    public var payees: [DirectoryRecord] { records(.vendor) + records(.client) + records(.employee) }

    /// Which modules refer to a directory record, as log tags.
    public func usedBy(_ code: String) -> [Module] {
        var used: [Module] = []
        if state.cv.contains(where: { $0.payee == code }) { used.append(.voucher) }
        if state.bs.contains(where: { $0.client == code }) { used.append(.billing) }
        if state.ids.contains(where: { $0.emp == code }) { used.append(.id) }
        return used
    }

    public var vouchersNewestFirst: [Voucher] { state.cv.sorted { $0.no > $1.no } }
    public var statementsNewestFirst: [Statement] { state.bs.sorted { $0.no > $1.no } }
    public var idsNewestFirst: [IDRecord] { state.ids.sorted { $0.no > $1.no } }

    // MARK: Numbering

    /// The next number after the highest one in use, under this year's prefix: "CV-2026-0142".
    static func nextNumber(_ existing: [String], prefix: String, width: Int = 4) -> String {
        let highest = existing.compactMap { no -> Int? in
            let digits = no.reversed().prefix { $0.isNumber }
            return Int(String(digits.reversed()))
        }.max() ?? 0
        return prefix + String(format: "%0\(width)d", highest + 1)
    }

    public var nextVoucherNo: String { Self.nextNumber(state.cv.map(\.no), prefix: "CV-\(clock.today.year)-") }
    public var nextStatementNo: String { Self.nextNumber(state.bs.map(\.no), prefix: "BS-\(clock.today.year)-") }
    public var nextIDNo: String { Self.nextNumber(state.ids.map(\.no), prefix: "APG-\(clock.today.year)-") }

    public func nextCode(_ type: RecordType) -> String {
        Self.nextNumber(records(type).map(\.code), prefix: type.codePrefix, width: 3)
    }

    // MARK: Blank forms

    public func newVoucher() -> VoucherDraft {
        VoucherDraft(no: nextVoucherNo, date: clock.today, payee: payees.first?.code ?? "",
                     bank: reference.banks.first ?? "", check: "",
                     lines: [LineDraft(acct: reference.accounts.first ?? "")],
                     prepared: defaults.preparedBy, checked: defaults.checkedBy, approved: defaults.approvedBy)
    }

    public func draft(from v: Voucher) -> VoucherDraft {
        VoucherDraft(no: v.no, date: v.date, payee: v.payee, bank: v.bank, check: v.check, lines: v.lines.map(LineDraft.init),
                     prepared: v.prepared, checked: v.checked, approved: v.approved)
    }

    public func newStatement() -> StatementDraft {
        let today = clock.today
        let client = records(.client).first
        return StatementDraft(no: nextStatementNo, date: today, due: today.adding(days: defaults.dueInDays),
                              client: client?.code ?? "", period: defaults.billingPeriod, ref: "",
                              lines: [LineDraft(desc: "Monthly rent"), LineDraft(desc: "Association dues")],
                              vat: client?.vat ?? false, ewt: client?.ewt ?? false, notes: defaults.paymentInstructions)
    }

    public func draft(from b: Statement) -> StatementDraft {
        StatementDraft(no: b.no, date: b.date, due: b.due, client: b.client, period: b.period, ref: b.ref,
                       lines: b.lines.map(LineDraft.init), vat: b.vat, ewt: b.ewt,
                       notes: b.notes ?? defaults.paymentInstructions)
    }

    /// Picking a client sets VAT and EWT from its directory record.
    public func applyClientDefaults(_ draft: inout StatementDraft) {
        guard let c = record(draft.client) else { return }
        draft.vat = c.vat ?? false
        draft.ewt = c.ewt ?? false
    }

    public func newID() -> IDDraft {
        let today = clock.today
        return IDDraft(no: nextIDNo, emp: "", name: "", pos: "", dept: "", issued: today,
                       valid: today.adding(years: defaults.idValidYears).adding(days: -1),
                       blood: reference.bloodTypes.first ?? "", iceName: "", iceNo: "",
                       signatory: defaults.signatory, photo: nil)
    }

    public func draft(from i: IDRecord) -> IDDraft {
        IDDraft(no: i.no, emp: i.emp, name: i.name, pos: i.pos, dept: i.dept, issued: i.issued, valid: i.valid,
                blood: i.blood, iceName: i.iceName, iceNo: i.iceNo, signatory: i.signatory, photo: i.photo)
    }

    /// Picking an employee fills the card from the directory.
    public func applyEmployee(_ draft: inout IDDraft) {
        guard let e = record(draft.emp) else { return }
        draft.name = e.name
        draft.pos = e.detail
        draft.dept = e.dept ?? ""
    }

    // MARK: Saving

    /// Saves a new voucher. A voucher loaded from the register is saved as a copy under a new number.
    @discardableResult
    public mutating func save(_ draft: VoucherDraft) throws -> Saved<Voucher> {
        var v = draft.voucher
        guard !v.lines.isEmpty, v.total > .zero else { throw KeystoneError("Add at least one particular with an amount.") }
        guard record(v.payee) != nil else { throw KeystoneError("Choose a payee from the directory.") }
        v.no = nextVoucherNo
        state.cv.append(v)
        log(.voucher, "\(v.no) for \(name(v.payee)) saved and routed for approval (\(v.total.formatted)).")
        return Saved(record: v, message: "\(v.no) saved and routed for approval.")
    }

    @discardableResult
    public mutating func save(_ draft: StatementDraft) throws -> Saved<Statement> {
        var b = draft.statement
        guard !b.lines.isEmpty, b.totals.subtotal > .zero else { throw KeystoneError("Add at least one charge with an amount.") }
        guard record(b.client) != nil else { throw KeystoneError("Choose a client from the directory.") }
        guard b.due >= b.date else { throw KeystoneError("The due date is before the statement date.") }
        b.no = nextStatementNo
        state.bs.append(b)
        log(.billing, "\(b.no) sent to \(name(b.client)) (\(b.totals.due.formatted) due \(Format.short(b.due))).")
        return Saved(record: b, message: "\(b.no) saved and marked as sent.")
    }

    @discardableResult
    public mutating func issue(_ draft: IDDraft) throws -> Saved<IDRecord> {
        var i = draft.record
        guard !i.name.isEmpty else { throw KeystoneError("Enter the name to print on the card.") }
        guard i.valid > i.issued else { throw KeystoneError("The card must be valid past the day it is issued.") }
        i.no = nextIDNo
        state.ids.append(i)
        log(.id, "\(i.no) issued to \(i.name); queued for printing.")
        return Saved(record: i, message: "\(i.no) issued and queued for printing.")
    }

    @discardableResult
    public mutating func add(_ draft: DirectoryDraft) throws -> Saved<DirectoryRecord> {
        let trimmed = { (s: String) in s.trimmingCharacters(in: .whitespacesAndNewlines) }
        let name = trimmed(draft.name)
        guard !name.isEmpty else { throw KeystoneError("Enter a name for the record.") }
        let duplicate = state.dir.first { $0.type == draft.type && $0.name.caseInsensitiveCompare(name) == .orderedSame }
        if let duplicate { throw KeystoneError("\(duplicate.code) already has that name.") }
        let isClient = draft.type == .client
        let dept = trimmed(draft.dept)
        let rec = DirectoryRecord(code: nextCode(draft.type), type: draft.type, name: name, tin: trimmed(draft.tin),
                                  detail: trimmed(draft.detail),
                                  dept: draft.type == .employee && !dept.isEmpty ? dept : nil,
                                  vat: isClient ? true : nil, ewt: isClient ? false : nil)
        state.dir.append(rec)
        log(.directory, "\(rec.code) \(rec.name) added to the directory as \(draft.type.rawValue.lowercased()).")
        return Saved(record: rec, message: "\(rec.code) added. It is now selectable in \(draft.type.usedIn).")
    }

    public mutating func setStatus(voucher no: String, to status: VoucherStatus) {
        guard let i = state.cv.firstIndex(where: { $0.no == no }), state.cv[i].status != status else { return }
        state.cv[i].status = status
        let v = state.cv[i]
        switch status {
        case .approved: log(.voucher, "\(no) approved by \(v.approved.isEmpty ? "approver" : v.approved).")
        case .released: log(.voucher, "\(no) released; check \(v.check.isEmpty ? "—" : v.check) to \(name(v.payee)).")
        case .forApproval: log(.voucher, "\(no) returned for approval.")
        }
    }

    public mutating func setStatus(statement no: String, to status: StatementStatus) {
        guard let i = state.bs.firstIndex(where: { $0.no == no }), state.bs[i].status != status else { return }
        state.bs[i].status = status
        log(.billing, "\(no) marked \(status.rawValue.lowercased()).")
    }

    public mutating func setStatus(id no: String, to status: IDStatus) {
        guard let i = state.ids.firstIndex(where: { $0.no == no }), state.ids[i].status != status else { return }
        state.ids[i].status = status
        log(.id, "\(no) marked \(status.rawValue.lowercased()).")
    }

    public mutating func resetToSample() {
        state = seed.state
    }

    private mutating func log(_ mod: Module, _ text: String) {
        state.log.insert(LogEntry(when: clock.stamp, mod: mod, text: text), at: 0)
    }
}
