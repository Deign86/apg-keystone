import Foundation

/// A calendar date with no time or zone, stored as "yyyy-MM-dd".
/// Mirrors C# `DateOnly` in the WinUI port.
public struct LocalDate: Hashable, Comparable, Codable, CustomStringConvertible, Sendable {
    public var year: Int
    public var month: Int
    public var day: Int

    public init(year: Int, month: Int, day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }

    /// Parses "yyyy-MM-dd". Returns nil for anything else.
    public init?(iso: String) {
        let parts = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, (1...12).contains(parts[1]), (1...31).contains(parts[2]) else { return nil }
        self.init(year: parts[0], month: parts[1], day: parts[2])
    }

    /// Today's date in the given time zone.
    public init(_ date: Date, timeZone: TimeZone = .current) {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = timeZone
        let c = cal.dateComponents([.year, .month, .day], from: date)
        self.init(year: c.year!, month: c.month!, day: c.day!)
    }

    public var iso: String {
        String(format: "%04d-%02d-%02d", year, month, day)
    }

    public var description: String { iso }

    /// "yyyy-MM", used to match records issued in the same month.
    public var monthKey: String { String(iso.prefix(7)) }

    public func adding(days: Int) -> LocalDate { shifted(.day, by: days) }

    public func adding(years: Int) -> LocalDate { shifted(.year, by: years) }

    /// Midnight UTC of this date, for handing to date pickers. Round-trips through
    /// `init(_:timeZone:)` with `.gmt`.
    public var utcDate: Date {
        Self.utcCalendar.date(from: DateComponents(year: year, month: month, day: day))!
    }

    public static func < (a: LocalDate, b: LocalDate) -> Bool { a.iso < b.iso }

    public init(from decoder: Decoder) throws {
        let s = try decoder.singleValueContainer().decode(String.self)
        guard let d = LocalDate(iso: s) else {
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Expected yyyy-MM-dd, got \(s)"))
        }
        self = d
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(iso)
    }

    private static let utcCalendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal
    }()

    private func shifted(_ unit: Calendar.Component, by n: Int) -> LocalDate {
        let moved = Self.utcCalendar.date(byAdding: unit, value: n, to: utcDate)!
        return LocalDate(moved, timeZone: TimeZone(identifier: "UTC")!)
    }
}
