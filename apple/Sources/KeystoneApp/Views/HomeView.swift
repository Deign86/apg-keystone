import KeystoneCore
import SwiftUI

/// The kiosk-style front door shared with the attendance tracker: status and clock on
/// top, the Orbitron greeting, then the systems as numbered tiles and the other APG apps.
struct HomeView: View {
    @Environment(AppModel.self) private var model
    @AppStorage("attendanceAddress") private var attendanceAddress = ""

    private let systems: [Destination] = [.vouchers, .billing, .idMaker, .directory, .activity, .overview]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                VStack(spacing: 0) {
                    HStack {
                        HStack(spacing: 7) {
                            Circle().fill(P.good).frame(width: 7, height: 7)
                            Text("All systems ready").font(.poppins(12, .semibold)).foregroundStyle(P.good)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 5)
                        .overlay(Capsule().strokeBorder(P.good.opacity(0.4)))
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(Format.weekdayLong(context.date)).font(.poppins(12)).foregroundStyle(P.ink2)
                            Text(Format.clock(context.date))
                                .font(.orbitron(Tokens.Size.clock))
                                .monospacedDigit()
                                .foregroundStyle(P.goldBright)
                        }
                    }
                    .padding(.bottom, 16)
                    .overlay(alignment: .bottom) { Rectangle().fill(P.line).frame(height: 1) }

                    VStack(spacing: 0) {
                        Image(nsImage: AppResources.logo)
                            .resizable()
                            .interpolation(.high)
                            .frame(width: 64, height: 64)
                            .frame(width: 92, height: 92)
                            .background(Circle().fill(P.surface2))
                            .overlay(Circle().strokeBorder(P.goldSoft))
                            .padding(.bottom, 18)
                            .accessibilityLabel("Alpha Premier phoenix")
                        Text(Format.greeting(context.date))
                            .font(.orbitron(Tokens.Size.hero))
                            .foregroundStyle(P.ink)
                            .accessibilityAddTraits(.isHeader)
                        Text(model.terminal.finding)
                            .font(.poppins(14, .semibold))
                            .foregroundStyle(P.gold)
                            .multilineTextAlignment(.center)
                            .padding(.top, 12)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 36)
                }
            }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16, alignment: .top), count: 3), spacing: 16) {
                ForEach(systems) { d in
                    SystemTile(destination: d, stat: model.terminal.tileStat(d)) { model.go(d) }
                }
            }

            HStack(alignment: .firstTextBaseline) {
                SectionLabel("Connected apps")
                Spacer()
                Text("Other APG apps Keystone opens for you. They keep running on their own.")
                    .font(.poppins(12.5)).foregroundStyle(P.ink2)
            }
            .padding(.top, 20)
            .overlay(alignment: .top) { Rectangle().fill(P.line).frame(height: 1) }
            .padding(.top, 30)
            .padding(.bottom, 12)

            HStack(alignment: .top, spacing: 16) {
                ConnectedApp(
                    name: "Attendance Tracker", platform: "Desktop · Windows",
                    about: "The RFID time-in kiosk at the front desk, with payroll PDFs and the bathroom key log.",
                    connection: attendanceAddress.isEmpty
                        ? "Opens its live attendance dashboard over the office network. Set its address in Settings (⌘,)."
                        : "Opens the live attendance dashboard at \(attendanceAddress).",
                    opens: "Live attendance dashboard"
                ) { model.openAttendance(address: attendanceAddress) }
                ConnectedApp(
                    name: "Alpha Branding Studio", platform: "Desktop · Windows & Mac",
                    about: "Applies the official gold frame to listing photos, crops and pairs them, and exports a ZIP.",
                    connection: "Launches the studio installed on this Mac.",
                    opens: "Installed studio app"
                ) { model.openBrandingStudio() }
            }

            Text("Sample data · ⌘1–⌘6 opens a system, ⌘0 comes back here")
                .font(.poppins(12))
                .foregroundStyle(P.ink3)
                .frame(maxWidth: .infinity)
                .padding(.top, 24)
        }
    }
}

/// A launcher tile. Hover lifts the border to gold; the figure at the foot is live.
private struct SystemTile: View {
    let destination: Destination
    let stat: (String, String)
    let action: () -> Void
    @State private var hover = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    Text(destination.title)
                        .font(.orbitron(14, .semibold))
                        .foregroundStyle(P.ink)
                    Spacer()
                    KeyBadge(key: destination.key)
                }
                Text(destination.blurb)
                    .font(.poppins(13))
                    .foregroundStyle(P.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, minHeight: 40, alignment: .topLeading)
                HStack {
                    Text(stat.0).font(.poppins(12)).foregroundStyle(P.ink2)
                    Spacer()
                    Text(stat.1).font(.orbitron(12.5, .semibold)).monospacedDigit().foregroundStyle(P.goldBright)
                }
                .padding(.top, 12)
                .overlay(alignment: .top) { Rectangle().fill(P.line).frame(height: 1) }
            }
            .padding(22)
            .background(RoundedRectangle(cornerRadius: Tokens.Radius.tile).fill(hover ? P.surface2 : P.surface))
            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.tile).strokeBorder(hover ? P.gold : P.line))
            .offset(y: hover && !reduceMotion ? -2 : 0)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
        .animation(.easeOut(duration: 0.2), value: hover)
        .accessibilityLabel("\(destination.title). \(stat.0): \(stat.1)")
        .accessibilityHint(destination.blurb)
    }
}

private struct ConnectedApp: View {
    let name: String
    let platform: String
    let about: String
    let connection: String
    let opens: String
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(name).font(.orbitron(14, .semibold))
                Spacer()
                Text(platform).font(.poppins(11, .semibold)).foregroundStyle(P.ink2)
            }
            Text(about).font(.poppins(13)).foregroundStyle(P.ink2).fixedSize(horizontal: false, vertical: true)
            Text(connection)
                .font(.poppins(12.5))
                .foregroundStyle(P.ink)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: Tokens.Radius.control).fill(P.goldTint))
            HStack {
                Text("Opens · \(opens)").font(.poppins(12)).foregroundStyle(P.ink2)
                Spacer()
                Button("Open", action: action).keystoneButton(small: true)
            }
            .padding(.top, 12)
            .overlay(alignment: .top) { Rectangle().fill(P.line).frame(height: 1) }
        }
        .panel(padding: 22)
        .frame(maxWidth: .infinity)
    }
}
