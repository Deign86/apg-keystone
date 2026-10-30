import XCTest
@testable import KeystoneCore

// Expected values marked "prototype" were produced by running the web prototype's own
// JavaScript (prototype/index.html), so these tests hold the native core to it.

final class MoneyTests: XCTestCase {
    func testFormatting() {
        XCTAssertEqual(Money(pesos: 48230.55).formatted, "₱48,230.55")
        XCTAssertEqual(Money(pesos: 0).formatted, "₱0.00")
        XCTAssertEqual(Money(pesos: 1_234_567.8).formatted, "₱1,234,567.80")
        XCTAssertEqual(Money(pesos: -650).formatted, "-₱650.00")
    }

    func testParsingWhatPeopleType() {
        XCTAssertEqual(Money(parsing: "12,500"), Money(centavos: 1_250_000))
        XCTAssertEqual(Money(parsing: "₱ 650.5"), Money(centavos: 65_050))
        XCTAssertNil(Money(parsing: ""))
        XCTAssertNil(Money(parsing: "abc"))
    }

    func testEditText() {
        XCTAssertEqual(Money(pesos: 12500).editText, "12500")
        XCTAssertEqual(Money(pesos: 650.5).editText, "650.50")
    }

    func testJSONRoundTripKeepsCentavos() throws {
        let m = Money(pesos: 48230.55)
        let data = try JSONEncoder().encode([m])
        XCTAssertEqual(String(decoding: data, as: UTF8.self), "[48230.55]")
        XCTAssertEqual(try JSONDecoder().decode([Money].self, from: data), [m])
    }

    func testPercentRoundsHalfAway() {
        XCTAssertEqual(Money(pesos: 548_250).percent(5), Money(pesos: 27_412.5))
        XCTAssertEqual(Money(centavos: 10).percent(5), Money(centavos: 1)) // 0.5 centavo rounds up
    }
}

final class AmountInWordsTests: XCTestCase {
    func testMatchesPrototype() {
        let cases: [(Double, String)] = [
            (0, "Zero Pesos Only"),
            (1, "One Pesos Only"),
            (21, "Twenty-One Pesos Only"),
            (101, "One Hundred One Pesos Only"),
            (1000, "One Thousand Pesos Only"),
            (48230.55, "Forty-Eight Thousand Two Hundred Thirty Pesos and 55/100 Only"),
            (12500.5, "Twelve Thousand Five Hundred Pesos and 50/100 Only"),
            (1_234_567.89, "One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven Pesos and 89/100 Only"),
            (2_000_000_000.07, "Two Billion Pesos and 07/100 Only"),
            (586_627.5, "Five Hundred Eighty-Six Thousand Six Hundred Twenty-Seven Pesos and 50/100 Only"),
        ]
        for (pesos, words) in cases {
            XCTAssertEqual(AmountInWords.pesos(Money(pesos: pesos)), words, "\(pesos)")
        }
    }
}

final class LocalDateTests: XCTestCase {
    func testParsingAndArithmetic() throws {
        let d = try XCTUnwrap(LocalDate(iso: "2026-10-30"))
        XCTAssertEqual(d.adding(days: 15).iso, "2026-11-14")
        XCTAssertEqual(d.adding(years: 1).adding(days: -1).iso, "2027-10-29")
        XCTAssertEqual(LocalDate(iso: "2028-02-29")!.adding(years: 1).iso, "2029-02-28")
        XCTAssertNil(LocalDate(iso: "30/10/2026"))
        XCTAssertEqual(LocalDate(iso: "2026-10-26 16:42")?.iso, "2026-10-26")
    }

    func testFormats() {
        let d = LocalDate(year: 2026, month: 10, day: 5)
        XCTAssertEqual(Format.long(d), "October 5, 2026")
        XCTAssertEqual(Format.short(d), "Oct 5, 2026")
        XCTAssertEqual(Format.short(nil), "—")
    }

    func testDatePickerRoundTrip() {
        let d = LocalDate(year: 2026, month: 3, day: 8)
        XCTAssertEqual(LocalDate(d.utcDate, timeZone: TimeZone(identifier: "UTC")!), d)
    }
}

final class SeedTests: XCTestCase {
    func testBundledSeedDecodes() {
        let seed = Seed.bundled
        XCTAssertEqual(seed.state.dir.count, 11)
        XCTAssertEqual(seed.state.cv.count, 3)
        XCTAssertEqual(seed.company.name, "ALPHA PREMIER GROUP")
        XCTAssertEqual(seed.reference.banks.count, 3)
    }

    func testStatementTotalsMatchPrototype() throws {
        let bs = Dictionary(uniqueKeysWithValues: Seed.bundled.state.bs.map { ($0.no, $0.totals.due) })
        XCTAssertEqual(bs["BS-2026-0086"], Money(pesos: 426_930))   // 399,000 + 12% − 5%
        XCTAssertEqual(bs["BS-2026-0087"], Money(pesos: 91_000))    // non-VAT client
        XCTAssertEqual(bs["BS-2026-0088"], Money(pesos: 586_627.5))
    }

    func testStateSurvivesJSONRoundTrip() throws {
        let state = Seed.bundled.state
        let data = try JSONEncoder().encode(state)
        XCTAssertEqual(try JSONDecoder().decode(TerminalState.self, from: data), state)
    }
}

final class TerminalTests: XCTestCase {
    /// Pinned to 30 Oct 2026, 9:05 in Manila.
    private func terminal() -> Terminal {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Manila")!
        let now = cal.date(from: DateComponents(year: 2026, month: 10, day: 30, hour: 9, minute: 5))!
        return Terminal(clock: Clock(now: { now }, calendar: cal))
    }

    func testNumbering() {
        let t = terminal()
        XCTAssertEqual(t.nextVoucherNo, "CV-2026-0142")
        XCTAssertEqual(t.nextStatementNo, "BS-2026-0089")
        XCTAssertEqual(t.nextIDNo, "APG-2026-0031")
        XCTAssertEqual(t.nextCode(.vendor), "V-005")
        XCTAssertEqual(Terminal.nextNumber([], prefix: "CV-2027-"), "CV-2027-0001")
    }

    func testSavingAVoucherNumbersAndLogsIt() throws {
        var t = terminal()
        var draft = t.newVoucher()
        draft.payee = "V-002"
        draft.lines = [LineDraft(desc: "Water – Head Office", acct: "5210 Utilities", amount: "8,412.30"), LineDraft()]
        let saved = try t.save(draft)
        XCTAssertEqual(saved.record.no, "CV-2026-0142")
        XCTAssertEqual(saved.record.lines.count, 1, "blank lines are dropped")
        XCTAssertEqual(saved.record.status, .forApproval)
        XCTAssertEqual(t.state.log.first?.when, "2026-10-30 09:05")
        XCTAssertEqual(t.state.log.first?.text, "CV-2026-0142 for Manila Water Company saved and routed for approval (₱8,412.30).")
        XCTAssertEqual(t.nextVoucherNo, "CV-2026-0143")
    }

    func testEmptyVoucherIsRefused() {
        var t = terminal()
        XCTAssertThrowsError(try t.save(t.newVoucher())) { error in
            XCTAssertEqual(error as? KeystoneError, KeystoneError("Add at least one particular with an amount."))
        }
    }

    func testReloadedVoucherSavesAsACopy() throws {
        var t = terminal()
        let old = t.state.cv[0]
        let saved = try t.save(t.draft(from: old))
        XCTAssertNotEqual(saved.record.no, old.no)
        XCTAssertEqual(t.state.cv.count, 4)
    }

    func testStatementDefaultsFollowTheClient() throws {
        let t = terminal()
        var draft = t.newStatement()
        XCTAssertEqual(draft.due.iso, "2026-11-14")
        draft.client = "C-002"
        t.applyClientDefaults(&draft)
        XCTAssertFalse(draft.vat)
        XCTAssertFalse(draft.ewt)
        draft.client = "C-003"
        t.applyClientDefaults(&draft)
        XCTAssertTrue(draft.vat && draft.ewt)
    }

    func testIssuingAnID() throws {
        var t = terminal()
        var draft = t.newID()
        XCTAssertEqual(draft.valid.iso, "2027-10-29")
        draft.emp = "E-004"
        t.applyEmployee(&draft)
        XCTAssertEqual(draft.pos, "Admin Assistant")
        let saved = try t.issue(draft)
        XCTAssertEqual(saved.message, "APG-2026-0031 issued and queued for printing.")
        XCTAssertEqual(t.usedBy("E-004"), [.id])
    }

    func testDirectoryCodesDoNotCollide() throws {
        var t = terminal()
        var d = DirectoryDraft()
        d.type = .client
        d.name = "Ortigas Dental Clinic"
        let saved = try t.add(d)
        XCTAssertEqual(saved.record.code, "C-004")
        XCTAssertEqual(saved.record.vat, true)
        XCTAssertThrowsError(try t.add(d), "same name twice")
        XCTAssertEqual(t.payees.map(\.code).prefix(4), ["V-001", "V-002", "V-003", "V-004"])
    }

    func testOverview() {
        let t = terminal()
        let figures = t.overviewFigures
        XCTAssertEqual(figures[0].value, "1")
        XCTAssertEqual(figures[0].caption, "₱35,000.00 pending signature")
        XCTAssertEqual(figures[1].value, "₱677,627.50")
        XCTAssertEqual(figures[1].caption, "2 statements open · 1 overdue")
        XCTAssertEqual(figures[2].value, "1")
        XCTAssertEqual(t.finding, "₱91,000.00 from Dela Cruz, Maria Teresa has been overdue since Oct 10, 2026.")
        XCTAssertEqual(t.tileStat(.activity).1, "Oct 26, 2026")
    }

    func testStatusChangesAreLogged() {
        var t = terminal()
        t.setStatus(voucher: "CV-2026-0141", to: .approved)
        XCTAssertEqual(t.state.log.first?.text, "CV-2026-0141 approved by CEO.")
        let count = t.state.log.count
        t.setStatus(voucher: "CV-2026-0141", to: .approved)
        XCTAssertEqual(t.state.log.count, count, "no entry when nothing changed")
    }
}

final class VerificationCodeTests: XCTestCase {
    private func rows(_ text: String) -> [String] {
        VerificationCode.cells(for: text).map { $0.map { $0 ? "1" : "0" }.joined() }
    }

    func testMatchesPrototype() {
        XCTAssertEqual(rows("APG-2026-0028|Juan Miguel P. Reyes"), [
            "111111101101101111111", "100000100000001000001", "101110100110001011101", "101110100101101011101",
            "101110101100001011101", "100000101000001000001", "111111100100001111111", "000000000110100000000",
            "111100010001001010010", "010101001010000010010", "001110010010000011001", "110010010101111011000",
            "000111100111010001011", "000000001011010011011", "111111100000111100100", "100000101100001000010",
            "101110101001000000000", "101110101001111111001", "101110100101111110000", "100000100001010000101",
            "111111100100010011010",
        ])
        XCTAssertEqual(rows("APG-2026-0031|"), [
            "111111100000001111111", "100000101001001000001", "101110101011001011101", "101110101010101011101",
            "101110101010001011101", "100000101001101000001", "111111100000001111111", "000000001000000000000",
            "011000100110111010001", "010101101100111100110", "011000001101001001100", "000000010000001000010",
            "010010011101010010100", "000000000001000001110", "111111100010101010100", "100000100001100101111",
            "101110100001100100100", "101110101101000101010", "101110100110100001011", "100000100101001001000",
            "111111100101100001100",
        ])
    }
}

final class StateFileTests: XCTestCase {
    func testSaveLoadAndBrokenFileIsKept() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let file = StateFile(url: folder.appendingPathComponent("state.json"))
        XCTAssertNil(file.load())
        try file.save(Seed.bundled.state)
        XCTAssertEqual(file.load(), Seed.bundled.state)

        try Data("{not json".utf8).write(to: file.url)
        XCTAssertNil(file.load())
        let kept = try FileManager.default.contentsOfDirectory(atPath: folder.path)
        XCTAssertTrue(kept.contains { $0.hasPrefix("state.broken-") })
        try? FileManager.default.removeItem(at: folder)
    }
}
