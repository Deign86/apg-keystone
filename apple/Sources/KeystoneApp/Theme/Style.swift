import AppKit
import CoreText
import KeystoneCore
import SwiftUI

// The APG house style, as shared by the attendance tracker, the website admin and Alpha
// Branding Studio: gold #c6a254 on near-black, Orbitron for display figures, Poppins for
// everything else. Colour sits on data and on the one primary action; surfaces are flat
// and separated by a 1px line, never a shadow or a gradient.

typealias P = Tokens.Palette

enum AppResources {
    /// The resource bundle, whether run from Xcode/`swift run` or from the packaged .app
    /// (where build.sh copies it into Contents/Resources so the app can be signed).
    static let bundle: Bundle = {
        let name = "Keystone_KeystoneApp.bundle"
        if let url = Bundle.main.resourceURL?.appendingPathComponent(name), let b = Bundle(url: url) { return b }
        return Bundle.module
    }()

    static var folder: URL? { bundle.url(forResource: "Resources", withExtension: nil) }

    static let logo: NSImage = folder.flatMap { NSImage(contentsOf: $0.appendingPathComponent("logo.png")) } ?? NSImage()

    static func registerFonts() {
        guard let fonts = folder?.appendingPathComponent("Fonts"),
              let files = try? FileManager.default.contentsOfDirectory(at: fonts, includingPropertiesForKeys: nil)
        else { return }
        for url in files where url.pathExtension.lowercased() == "ttf" {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
    }
}

extension Font {
    /// Orbitron: greetings, the clock, figures and document titles.
    static func orbitron(_ size: CGFloat, _ weight: Font.Weight = .semibold) -> Font {
        .custom(Tokens.FontName.display, size: size).weight(weight)
    }

    /// Poppins, picking the static face for the weight.
    static func poppins(_ size: CGFloat = Tokens.Size.body, _ weight: Font.Weight = .regular) -> Font {
        let face: String
        if weight == .bold || weight == .heavy || weight == .black { face = Tokens.FontName.bold }
        else if weight == .semibold { face = Tokens.FontName.semibold }
        else if weight == .medium { face = Tokens.FontName.medium }
        else { face = Tokens.FontName.regular }
        return .custom(face, size: size)
    }
}

extension Tone {
    var color: Color {
        switch self {
        case .good: P.good
        case .warn: P.warn
        case .bad: P.bad
        case .neutral: P.ink2
        }
    }
}

// MARK: Surfaces

extension View {
    /// A card: one tone up from the ground with a 1px line. No shadow.
    func panel(padding: CGFloat = 18, fill: Color = P.surface) -> some View {
        self.padding(padding)
            .background(RoundedRectangle(cornerRadius: Tokens.Radius.card).fill(fill))
            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.card).strokeBorder(P.line))
    }
}

// MARK: Type pieces

/// The small gold label over a title ("ADMINISTRATOR ACCESS"), as on every APG admin screen.
struct Eyebrow: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text.uppercased())
            .font(.poppins(11, .bold))
            .tracking(1.1)
            .foregroundStyle(P.gold)
    }
}

/// The gold section heading inside a card ("VOUCHER REGISTER").
struct SectionLabel: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text.uppercased())
            .font(.poppins(11, .bold))
            .tracking(0.9)
            .foregroundStyle(P.gold)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Eyebrow, title, the one line that says what matters, and the actions on the right.
struct ScreenHeader<Actions: View>: View {
    let eyebrow: String
    let title: String
    let line: String
    @ViewBuilder var actions: Actions

    var body: some View {
        HStack(alignment: .bottom, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Eyebrow(eyebrow)
                Text(title)
                    .font(.poppins(Tokens.Size.h1, .bold))
                    .tracking(-0.3)
                    .foregroundStyle(P.ink)
                    .accessibilityAddTraits(.isHeader)
                Text(line)
                    .font(.poppins(14))
                    .foregroundStyle(P.ink2)
                    .frame(maxWidth: 640, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 16)
            HStack(spacing: 8) { actions }
        }
        .padding(.bottom, 18)
        .overlay(alignment: .bottom) { Rectangle().fill(P.line).frame(height: 1) }
        .padding(.bottom, 20)
    }
}

/// The numbered square used for keyboard shortcuts across APG apps.
struct KeyBadge: View {
    let key: Int
    var active = false

    var body: some View {
        Text("\(key)")
            .font(.orbitron(10, .bold))
            .frame(width: 22, height: 22)
            .foregroundStyle(active ? P.goldInk : P.ink2)
            .background(RoundedRectangle(cornerRadius: Tokens.Radius.pill).fill(active ? P.gold : P.surface2))
            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.pill).strokeBorder(active ? P.gold : P.line))
    }
}

/// Outlined status capsule in Orbitron capitals, as in the attendance tracker.
struct StatusPill: View {
    let text: String
    let tone: Tone

    var body: some View {
        Text(text.uppercased())
            .font(.orbitron(9.5, .semibold))
            .tracking(0.6)
            .lineLimit(1)
            .fixedSize()
            .foregroundStyle(tone.color)
            .padding(.horizontal, 9)
            .padding(.vertical, 3)
            .overlay(Capsule().strokeBorder(tone.color.opacity(0.55)))
    }
}

/// A module tag in the activity log ("CV").
struct ModuleTag: View {
    let module: Module

    var body: some View {
        Text(module.rawValue)
            .font(.orbitron(9.5, .bold))
            .tracking(0.4)
            .foregroundStyle(P.goldBright)
            .frame(minWidth: 34)
            .padding(.vertical, 2)
            .background(RoundedRectangle(cornerRadius: 3).fill(P.goldTint))
    }
}

// MARK: Buttons

struct KeystoneButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, quiet }
    var kind: Kind = .secondary
    var small = false

    func makeBody(configuration: Configuration) -> some View {
        Body(configuration: configuration, kind: kind, small: small)
    }

    private struct Body: View {
        let configuration: Configuration
        let kind: Kind
        let small: Bool
        @Environment(\.isEnabled) private var isEnabled
        @Environment(\.accessibilityReduceMotion) private var reduceMotion
        @State private var hover = false

        var body: some View {
            configuration.label
                .font(.poppins(small ? 12 : 13, .semibold))
                .lineLimit(1)
                .padding(.horizontal, small ? 10 : 14)
                .frame(height: small ? 28 : 34)
                .foregroundStyle(kind == .primary ? P.goldInk : P.goldBright)
                .background(RoundedRectangle(cornerRadius: Tokens.Radius.control).fill(fill))
                .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.control).strokeBorder(border))
                .contentShape(Rectangle())
                .opacity(isEnabled ? 1 : 0.4)
                .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
                .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
                .animation(.easeOut(duration: 0.15), value: hover)
                .onHover { hover = $0 }
        }

        private var fill: Color {
            switch kind {
            case .primary: hover ? P.goldBright : P.gold
            case .secondary: hover ? P.surface2 : P.input
            case .quiet: hover ? P.surface2 : .clear
            }
        }

        private var border: Color {
            switch kind {
            case .primary: .clear
            case .secondary: hover ? P.gold : P.lineBright
            case .quiet: .clear
            }
        }
    }
}

extension View {
    func keystoneButton(_ kind: KeystoneButtonStyle.Kind = .secondary, small: Bool = false) -> some View {
        buttonStyle(KeystoneButtonStyle(kind: kind, small: small))
    }
}

/// Gold square checkbox.
struct GoldCheckbox: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 3)
                    .fill(configuration.isOn ? P.gold : P.input)
                    .overlay(RoundedRectangle(cornerRadius: 3).strokeBorder(configuration.isOn ? P.gold : P.lineBright))
                    .overlay {
                        if configuration.isOn {
                            Image(systemName: "checkmark").font(.system(size: 9, weight: .heavy)).foregroundStyle(P.goldInk)
                        }
                    }
                    .frame(width: 16, height: 16)
                configuration.label.font(.poppins(13)).foregroundStyle(P.ink)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(configuration.isOn ? [.isSelected] : [])
    }
}
