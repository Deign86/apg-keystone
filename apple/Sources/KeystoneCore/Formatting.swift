import Foundation

/// Fixed English (Philippines) formats, written out by hand so both platforms print
/// exactly the same strings whatever the machine's locale.
public enum Format {
    static let months = ["January", "February", "March", "April", "May", "June", "July",
                         "August", "September", "October", "November", "December"]
    static let weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

    /// "October 20, 2026"; "—" for nil.
    public static func long(_ d: LocalDate?) -> String {
        guard let d else { return "—" }
        return "\(months[d.month - 1]) \(d.day), \(d.year)"
    }

    /// "Oct 20, 2026"; "—" for nil.
    public static func short(_ d: LocalDate?) -> String {
        guard let d else { return "—" }
        return "\(months[d.month - 1].prefix(3)) \(d.day), \(d.year)"
    }

    /// "Friday, October 30, 2026"
    public static func weekdayLong(_ date: Date, calendar: Calendar = .current) -> String {
        let wd = calendar.component(.weekday, from: date)
        return "\(weekdays[wd - 1]), \(long(LocalDate(date, timeZone: calendar.timeZone)))"
    }

    /// "4:48:52 PM"
    public static func clock(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.hour, .minute, .second], from: date)
        let h = c.hour!
        let h12 = h % 12 == 0 ? 12 : h % 12
        return String(format: "%d:%02d:%02d %@", h12, c.minute!, c.second!, h < 12 ? "AM" : "PM")
    }

    /// The activity-log stamp: "2026-10-30 16:48".
    public static func stamp(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        return String(format: "%04d-%02d-%02d %02d:%02d", c.year!, c.month!, c.day!, c.hour!, c.minute!)
    }

    public static func greeting(_ date: Date, calendar: Calendar = .current) -> String {
        let h = calendar.component(.hour, from: date)
        return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
    }

    /// "1 statement" / "3 statements"
    public static func count(_ n: Int, _ singular: String, _ plural: String? = nil) -> String {
        "\(n) \(n == 1 ? singular : (plural ?? singular + "s"))"
    }
}

public enum AmountInWords {
    private static let ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
                               "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
                               "Eighteen", "Nineteen"]
    private static let tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
    private static let scales = ["", "Thousand", "Million", "Billion", "Trillion"]

    /// "Forty-Eight Thousand Two Hundred Thirty Pesos and 55/100 Only", as printed on a check voucher.
    public static func pesos(_ amount: Money) -> String {
        let cents = amount.centavos.magnitude
        var whole = cents / 100
        let centavos = Int(cents % 100)
        var parts: [String] = []
        if whole == 0 { parts.append("Zero") }
        var i = 0
        while whole > 0 {
            let c = Int(whole % 1000)
            if c > 0 { parts.insert(chunk(c) + (scales[i].isEmpty ? "" : " " + scales[i]), at: 0) }
            whole /= 1000
            i += 1
        }
        let tail = centavos > 0 ? " and " + String(format: "%02d", centavos) + "/100" : ""
        return parts.joined(separator: " ") + " Pesos" + tail + " Only"
    }

    private static func chunk(_ n: Int) -> String {
        var x = n
        var s = ""
        if x >= 100 {
            s += ones[x / 100] + " Hundred"
            x %= 100
            if x > 0 { s += " " }
        }
        if x >= 20 {
            s += tens[x / 10]
            if x % 10 > 0 { s += "-" + ones[x % 10] }
        } else if x > 0 {
            s += ones[x]
        }
        return s
    }
}
