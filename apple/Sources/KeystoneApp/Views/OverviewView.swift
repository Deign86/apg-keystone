import KeystoneCore
import SwiftUI

/// "What needs signing or collecting?" The finding leads under the title; the four
/// figures share one strip split by 1px lines; the open items and the latest activity
/// sit side by side.
struct OverviewView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let t = model.terminal
        VStack(alignment: .leading, spacing: 16) {
            ScreenHeader(eyebrow: Destination.overview.section, title: "Overview", line: t.finding) {
                Button("New check voucher") { model.clearVoucher(); model.go(.vouchers) }.keystoneButton(.primary)
                Button("New statement") { model.clearStatement(); model.go(.billing) }.keystoneButton()
                Button("New ID") { model.clearCard(); model.go(.idMaker) }.keystoneButton()
            }

            FigureStrip(figures: t.overviewFigures)

            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    SectionLabel("Waiting on you")
                    if t.awaitingApproval.isEmpty && t.outstanding.isEmpty {
                        Text("No voucher is waiting for a signature and every statement is paid.")
                            .font(.poppins(13)).foregroundStyle(P.ink2).padding(.vertical, 8)
                    }
                    ForEach(t.awaitingApproval) { v in
                        OpenItem(no: v.no, who: t.name(v.payee), amount: v.total.formatted,
                                 status: v.status.rawValue, tone: v.status.tone) {
                            model.load(v); model.go(.vouchers)
                        }
                    }
                    ForEach(t.outstanding.sorted { $0.due < $1.due }) { b in
                        OpenItem(no: b.no, who: "\(t.name(b.client)) · due \(Format.short(b.due))",
                                 amount: b.totals.due.formatted, status: b.status.rawValue, tone: b.status.tone) {
                            model.load(b); model.go(.billing)
                        }
                    }
                }
                .panel()
                .frame(maxWidth: .infinity, alignment: .top)

                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        SectionLabel("Recent activity")
                        Spacer()
                        Button("View all") { model.go(.activity) }.keystoneButton(.quiet, small: true)
                    }
                    ActivityFeed(entries: Array(t.state.log.prefix(5)), compact: true)
                }
                .panel()
                .frame(width: 440, alignment: .top)
            }
        }
    }
}

/// One container, cells split by 1px lines: label, figure, and what the figure counts.
struct FigureStrip: View {
    let figures: [Figure]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(figures.enumerated()), id: \.offset) { i, f in
                VStack(alignment: .leading, spacing: 6) {
                    Text(f.label).font(.poppins(12.5, .medium)).foregroundStyle(P.ink2)
                    Text(f.value)
                        .font(.orbitron(24))
                        .monospacedDigit()
                        .foregroundStyle(P.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Text(f.caption).font(.poppins(12)).foregroundStyle(P.ink3).lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
                .overlay(alignment: .leading) {
                    if i > 0 { Rectangle().fill(P.line).frame(width: 1) }
                }
                .accessibilityElement(children: .combine)
            }
        }
        .background(RoundedRectangle(cornerRadius: Tokens.Radius.card).fill(P.surface))
        .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.card).strokeBorder(P.line))
    }
}

private struct OpenItem: View {
    let no: String
    let who: String
    let amount: String
    let status: String
    let tone: Tone
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(no).font(.poppins(13, .semibold)).monospacedDigit().foregroundStyle(P.goldBright)
                    Text(who).font(.poppins(12)).foregroundStyle(P.ink2).lineLimit(1)
                }
                Spacer(minLength: 8)
                Text(amount).font(.poppins(13, .semibold)).monospacedDigit().foregroundStyle(P.ink)
                StatusPill(text: status, tone: tone).frame(width: 104, alignment: .trailing)
            }
            .frame(minHeight: 45)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .top) { Rectangle().fill(P.line).frame(height: 1) }
        .help("Open \(no)")
    }
}
