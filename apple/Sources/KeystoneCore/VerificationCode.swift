/// The 21×21 verification pattern on the back of an ID card: three finder squares and a
/// field seeded from the card's number and name. It is the same algorithm as the
/// prototype's `drawCode`, bit for bit, so a card looks the same on every platform.
/// It is a visual check mark, not a scannable QR code.
public enum VerificationCode {
    public static let size = 21

    /// `cells[y][x]` is true where the square is dark.
    public static func cells(for text: String) -> [[Bool]] {
        // FNV-1a over the first UTF-16 unit of each character, as `charCodeAt(0)` does.
        var h: UInt32 = 2_166_136_261
        for ch in text {
            h ^= UInt32(String(ch).utf16.first ?? 0)
            h = h &* 16_777_619
        }
        func next() -> Double {
            h ^= h << 13
            h ^= h >> 17
            h ^= h << 5
            return Double(h) / 4_294_967_296
        }

        let n = size
        var grid = Array(repeating: Array(repeating: false, count: n), count: n)
        for y in 0..<n {
            for x in 0..<n {
                let inFinder = (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8)
                if !inFinder && next() < 0.45 { grid[y][x] = true }
            }
        }
        for (fx, fy) in [(0, 0), (n - 7, 0), (0, n - 7)] {
            for y in 0..<7 {
                for x in 0..<7 {
                    let ring = max(abs(x - 3), abs(y - 3))
                    grid[fy + y][fx + x] = ring != 2
                }
            }
        }
        return grid
    }

    /// The text the pattern is drawn from, as the prototype builds it.
    public static func seed(no: String, name: String) -> String { "\(no)|\(name)" }
}
