import KeystoneCore
import SwiftUI

/// A labelled form field: 12.5pt label above a dark input that turns gold when focused.
struct Field<Content: View>: View {
    let label: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(.poppins(12.5, .medium)).foregroundStyle(P.ink)
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The input chrome shared by text, menu and date fields.
struct InputBox<Content: View>: View {
    var focused = false
    var readOnly = false
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity, minHeight: 34, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: Tokens.Radius.input).fill(P.input))
            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.input).strokeBorder(focused ? P.gold : P.line))
            .animation(.easeOut(duration: 0.12), value: focused)
    }
}

struct TextInput: View {
    var placeholder = ""
    @Binding var text: String
    var figures = false
    var alignment: TextAlignment = .leading
    @FocusState private var focused: Bool

    var body: some View {
        InputBox(focused: focused) {
            TextField("", text: $text, prompt: Text(placeholder).foregroundColor(P.ink3))
                .textFieldStyle(.plain)
                .font(.poppins(13))
                .monospacedDigit()
                .multilineTextAlignment(alignment)
                .foregroundStyle(figures ? P.goldBright : P.ink)
                .focused($focused)
        }
    }
}

/// A number the app assigns ("CV-2026-0142"): shown, not editable.
struct ReadOnlyInput: View {
    let text: String

    var body: some View {
        InputBox {
            Text(text).font(.poppins(13, .medium)).monospacedDigit().foregroundStyle(P.goldBright).textSelection(.enabled)
        }
    }
}

struct MultilineInput: View {
    @Binding var text: String
    @FocusState private var focused: Bool

    var body: some View {
        TextEditor(text: $text)
            .font(.poppins(13))
            .foregroundStyle(P.ink)
            .scrollContentBackground(.hidden)
            .focused($focused)
            .padding(6)
            .frame(minHeight: 64)
            .background(RoundedRectangle(cornerRadius: Tokens.Radius.input).fill(P.input))
            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.input).strokeBorder(focused ? P.gold : P.line))
    }
}

/// A dropdown in the same chrome as the text fields.
struct MenuInput<Value: Hashable>: View {
    @Binding var selection: Value
    let options: [Value]
    let title: (Value) -> String

    var body: some View {
        Menu {
            ForEach(options, id: \.self) { option in
                Button {
                    selection = option
                } label: {
                    if option == selection { Label(title(option), systemImage: "checkmark") } else { Text(title(option)) }
                }
            }
        } label: {
            InputBox {
                HStack {
                    Text(options.contains(selection) ? title(selection) : "—")
                        .font(.poppins(13))
                        .foregroundStyle(P.ink)
                        .lineLimit(1)
                    Spacer(minLength: 6)
                    Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold)).foregroundStyle(P.ink2)
                }
            }
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .buttonStyle(.plain)
    }
}

extension MenuInput where Value == String {
    init(selection: Binding<String>, options: [String]) {
        self.init(selection: selection, options: options, title: { $0 })
    }
}

/// A date field bound to a `LocalDate`, in UTC so the picked day never shifts.
struct DateInput: View {
    @Binding var date: LocalDate

    private var utc: TimeZone { TimeZone(identifier: "UTC")! }

    var body: some View {
        InputBox {
            DatePicker("", selection: Binding(
                get: { date.utcDate },
                set: { date = LocalDate($0, timeZone: utc) }
            ), displayedComponents: .date)
            .labelsHidden()
            .datePickerStyle(.field)
            .environment(\.timeZone, utc)
            .font(.poppins(13))
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

/// A row of fields that share the width equally.
struct FieldRow<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        HStack(alignment: .top, spacing: 10) { content }
    }
}
