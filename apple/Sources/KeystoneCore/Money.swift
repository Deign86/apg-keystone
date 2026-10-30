import Foundation

/// An amount in Philippine pesos, held as whole centavos so totals never drift.
/// Stored in JSON as a plain number of pesos (48230.55), the same as the prototype.
/// Mirrors a C# `long` of centavos in the WinUI port.
public struct Money: Hashable, Comparable, Codable, Sendable, AdditiveArithmetic, CustomStringConvertible {
    public var centavos: Int64

    public init(centavos: Int64) { self.centavos = centavos }

    public init(pesos: Double) {
        self.centavos = Int64((pesos * 100).rounded())
    }

    /// Parses what a person types into an amount field: "12,500", "₱ 650.5", "48230.55".
    /// Returns nil when there is no number in it.
    public init?(parsing text: String) {
        let cleaned = text.filter { $0.isNumber || $0 == "." || $0 == "-" }
        guard !cleaned.isEmpty, let value = Double(cleaned) else { return nil }
        self.init(pesos: value)
    }

    public static let zero = Money(centavos: 0)

    public var pesos: Double { Double(centavos) / 100 }

    /// This amount times a whole-number percentage, rounded half away from zero to the centavo.
    public func percent(_ rate: Int) -> Money {
        let scaled = centavos * Int64(rate)
        let half: Int64 = scaled >= 0 ? 50 : -50
        return Money(centavos: (scaled + half) / 100)
    }

    /// "₱48,230.55"
    public var formatted: String {
        let sign = centavos < 0 ? "-" : ""
        let abs = centavos.magnitude
        let whole = String(abs / 100)
        var grouped = ""
        for (i, ch) in whole.reversed().enumerated() {
            if i > 0 && i % 3 == 0 { grouped.append(",") }
            grouped.append(ch)
        }
        return sign + "₱" + String(grouped.reversed()) + "." + String(format: "%02d", Int(abs % 100))
    }

    /// The plain number for an editable field: "12500.00" -> "12500", "650.5" -> "650.50".
    public var editText: String {
        centavos % 100 == 0 ? String(centavos / 100) : String(format: "%.2f", pesos)
    }

    public var description: String { formatted }

    public static func < (a: Money, b: Money) -> Bool { a.centavos < b.centavos }
    public static func + (a: Money, b: Money) -> Money { Money(centavos: a.centavos + b.centavos) }
    public static func - (a: Money, b: Money) -> Money { Money(centavos: a.centavos - b.centavos) }

    public init(from decoder: Decoder) throws {
        self.init(pesos: try decoder.singleValueContainer().decode(Double.self))
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(pesos)
    }
}

extension Sequence {
    public func sum(_ amount: (Element) -> Money) -> Money {
        reduce(.zero) { $0 + amount($1) }
    }
}
