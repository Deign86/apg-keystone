import KeystoneCore
import SwiftUI

/// The frame: the labelled rail on the left (236pt, as in the APG website admin) and one
/// screen beside it.
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 0) {
            Rail()
            Rectangle().fill(P.line).frame(width: 1)
            ScrollView {
                screen
                    .frame(maxWidth: Tokens.Layout.contentMaxWidth)
                    .padding(.horizontal, 32)
                    .padding(.top, 28)
                    .padding(.bottom, 56)
                    .frame(maxWidth: .infinity)
                    .id(model.destination)
                    .transition(.opacity)
            }
            .scrollIndicators(.automatic)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: model.destination)
        }
        .background(P.bg)
        .foregroundStyle(P.ink)
        .font(.poppins())
        .overlay(alignment: .bottom) { ToastView() }
        .confirmationDialog("Reset to the sample data?", isPresented: Binding(
            get: { model.confirmingReset }, set: { model.confirmingReset = $0 })) {
            Button("Reset data", role: .destructive) { model.resetSampleData() }
        } message: {
            Text("Every voucher, statement, ID and directory record you added is removed. This cannot be undone.")
        }
    }

    @ViewBuilder private var screen: some View {
        switch model.destination {
        case .home: HomeView()
        case .overview: OverviewView()
        case .vouchers: VouchersView()
        case .billing: BillingView()
        case .idMaker: IDMakerView()
        case .directory: DirectoryView()
        case .activity: ActivityView()
        }
    }
}

private struct Rail: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            Button { model.go(.home) } label: {
                HStack(spacing: 10) {
                    Image(nsImage: AppResources.logo).resizable().interpolation(.high).frame(width: 38, height: 38)
                    VStack(alignment: .leading, spacing: 2) {
                        (Text("ALPHA PREMIER ").foregroundColor(P.ink) + Text("KEYSTONE").foregroundColor(P.goldBright))
                            .font(.orbitron(11, .bold))
                        Text(model.company.shortAddress)
                            .font(.poppins(10.5))
                            .foregroundStyle(P.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Keystone home")

            VStack(alignment: .leading, spacing: 2) {
                ForEach(Destination.allCases) { d in
                    RailItem(destination: d, active: model.destination == d) { model.go(d) }
                }
            }

            Spacer()

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Circle().fill(P.good).frame(width: 7, height: 7)
                    Text("Administrator access").font(.poppins(11.5, .semibold)).foregroundStyle(P.ink)
                }
                Text("Data saved on this Mac").font(.poppins(11.5)).foregroundStyle(P.ink2)
                Text("⌘0 home · ⌘1–⌘6 systems").font(.poppins(10.5)).foregroundStyle(P.ink3)
            }
        }
        .padding(.vertical, 20)
        .padding(.leading, 16)
        .padding(.trailing, 14)
        .frame(width: Tokens.Layout.railWidth, alignment: .leading)
        .frame(maxHeight: .infinity)
        .background(P.bg)
    }
}

/// A rail entry: the numbered key badge (filled gold when active, as in the attendance
/// tracker) and its label. The selection is also marked by a 1px gold line on the rail's
/// edge, the one accent line the screens use for every selection.
private struct RailItem: View {
    let destination: Destination
    let active: Bool
    let action: () -> Void
    @State private var hover = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                KeyBadge(key: destination.key, active: active)
                Text(destination.title)
                    .font(.poppins(13, .semibold))
                    .foregroundStyle(active ? P.goldBright : hover ? P.ink : P.ink2)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .frame(height: 38)
            .background(RoundedRectangle(cornerRadius: Tokens.Radius.control).fill(hover && !active ? P.surface : .clear))
            .overlay(alignment: .trailing) {
                Rectangle().fill(P.gold).frame(width: 1).opacity(active ? 1 : 0).offset(x: 15)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
        .animation(.easeOut(duration: 0.12), value: hover)
        .accessibilityAddTraits(active ? [.isSelected] : [])
        .help("\(destination.title) (⌘\(destination.key))")
    }
}

private struct ToastView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if let text = model.toast {
                Text(text)
                    .font(.poppins(13, .semibold))
                    .foregroundStyle(P.goldInk)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: Tokens.Radius.control).fill(P.goldBright))
                    // The toast floats over the screen, so it is the one thing with a shadow.
                    .shadow(color: .black.opacity(0.45), radius: 15, y: 10)
                    .padding(.bottom, 20)
                    .padding(.leading, Tokens.Layout.railWidth)
                    .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                    .accessibilityAddTraits(.updatesFrequently)
                    .id(text)
            }
        }
        .animation(.easeOut(duration: 0.22), value: model.toast)
    }
}
