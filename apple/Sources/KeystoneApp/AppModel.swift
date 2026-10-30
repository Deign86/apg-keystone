import AppKit
import KeystoneCore
import Observation
import SwiftUI
import UniformTypeIdentifiers

/// The app's one view model. It owns the `Terminal` (all the rules) and the forms'
/// drafts, saves after every change, and does the Mac-only work: files, PDFs, launching
/// the other APG apps. The WinUI port has the same class as a CommunityToolkit
/// `ObservableObject` (see docs/PORTING.md).
@MainActor
@Observable
final class AppModel {
    private(set) var terminal: Terminal
    var destination: Destination = .home

    var voucher: VoucherDraft
    var statement: StatementDraft
    var card: IDDraft
    var newRecord = DirectoryDraft()
    var addingRecord = false
    var confirmingReset = false

    private(set) var toast: String?
    private var toastTask: Task<Void, Never>?

    private let file: StateFile
    let photos: URL

    init(file: StateFile = .standard) {
        self.file = file
        self.photos = file.url.deletingLastPathComponent().appendingPathComponent("photos", isDirectory: true)
        let t = Terminal(state: file.load())
        terminal = t
        voucher = t.newVoucher()
        statement = t.newStatement()
        card = t.newID()
    }

    var company: Company { terminal.company }
    var reference: ReferenceData { terminal.reference }

    // MARK: Navigation and feedback

    func go(_ d: Destination) {
        destination = d
    }

    func show(_ message: String) {
        toast = message
        toastTask?.cancel()
        toastTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(2.6))
            guard !Task.isCancelled else { return }
            self?.toast = nil
        }
    }

    /// Applies a change, saves, and shows its confirmation or the reason it was refused.
    @discardableResult
    private func change(_ body: (inout Terminal) throws -> String) -> Bool {
        do {
            let message = try body(&terminal)
            persist()
            show(message)
            return true
        } catch {
            show(error.localizedDescription)
            return false
        }
    }

    private func persist() {
        do { try file.save(terminal.state) } catch { show("Could not save: \(error.localizedDescription)") }
    }

    // MARK: Check vouchers

    func saveVoucher() {
        if change({ try $0.save(voucher).message }) { voucher = terminal.newVoucher() }
    }

    func clearVoucher() { voucher = terminal.newVoucher() }

    func load(_ v: Voucher) {
        voucher = terminal.draft(from: v)
        show("\(v.no) loaded into the form. Saving creates a new voucher.")
    }

    func setStatus(_ v: Voucher, _ s: VoucherStatus) {
        change { $0.setStatus(voucher: v.no, to: s); return "\(v.no) marked \(s.rawValue.lowercased())." }
    }

    // MARK: Billing statements

    func pickClient(_ code: String) {
        statement.client = code
        terminal.applyClientDefaults(&statement)
    }

    func saveStatement() {
        if change({ try $0.save(statement).message }) { statement = terminal.newStatement() }
    }

    func clearStatement() { statement = terminal.newStatement() }

    func load(_ b: Statement) {
        statement = terminal.draft(from: b)
        show("\(b.no) loaded into the form. Saving creates a new statement.")
    }

    func setStatus(_ b: Statement, _ s: StatementStatus) {
        change { $0.setStatus(statement: b.no, to: s); return "\(b.no) marked \(s.rawValue.lowercased())." }
    }

    // MARK: ID maker

    func pickEmployee(_ code: String) {
        card.emp = code
        terminal.applyEmployee(&card)
    }

    func issueCard() {
        if change({ try $0.issue(card).message }) { card = terminal.newID() }
    }

    func clearCard() { card = terminal.newID() }

    func load(_ i: IDRecord) {
        card = terminal.draft(from: i)
        show("\(i.no) loaded for preview. Saving issues a new ID.")
    }

    func setStatus(_ i: IDRecord, _ s: IDStatus) {
        change { $0.setStatus(id: i.no, to: s); return "\(i.no) marked \(s.rawValue.lowercased())." }
    }

    /// Asks for a picture, crops it square from the centre at 640px and keeps it as the draft's photo.
    func choosePhoto() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.image]
        panel.message = "Choose the employee’s photo. A square picture works best."
        guard panel.runModal() == .OK, let url = panel.url else { return }
        guard let image = NSImage(contentsOf: url), let jpeg = Self.squareJPEG(image, side: 640) else {
            show("That file could not be read as a picture.")
            return
        }
        do {
            try FileManager.default.createDirectory(at: photos, withIntermediateDirectories: true)
            let name = "\(UUID().uuidString).jpg"
            try jpeg.write(to: photos.appendingPathComponent(name))
            card.photo = name
        } catch {
            show("Could not keep the photo: \(error.localizedDescription)")
        }
    }

    func photo(_ name: String?) -> NSImage? {
        guard let name else { return nil }
        return NSImage(contentsOf: photos.appendingPathComponent(name))
    }

    private static func squareJPEG(_ image: NSImage, side: CGFloat) -> Data? {
        guard let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
        let s = min(cg.width, cg.height)
        let crop = CGRect(x: (cg.width - s) / 2, y: (cg.height - s) / 2, width: s, height: s)
        guard let square = cg.cropping(to: crop) else { return nil }
        let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(side), pixelsHigh: Int(side), bitsPerSample: 8,
                                   samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                                   bytesPerRow: 0, bitsPerPixel: 0)
        guard let rep, let ctx = NSGraphicsContext(bitmapImageRep: rep) else { return nil }
        ctx.cgContext.interpolationQuality = .high
        ctx.cgContext.draw(square, in: CGRect(x: 0, y: 0, width: side, height: side))
        return rep.representation(using: .jpeg, properties: [.compressionFactor: 0.85])
    }

    // MARK: Directory

    func addRecord() {
        if change({ try $0.add(newRecord).message }) {
            newRecord = DirectoryDraft()
            addingRecord = false
        }
    }

    // MARK: Activity

    func resetSampleData() {
        terminal.resetToSample()
        file.delete()
        voucher = terminal.newVoucher()
        statement = terminal.newStatement()
        card = terminal.newID()
        show("Data reset to the sample set.")
    }

    // MARK: Connected apps

    /// Opens Alpha Branding Studio if it is installed on this Mac.
    func openBrandingStudio() {
        let id = "com.alphapremier.brandingstudio"
        guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: id) else {
            show("Alpha Branding Studio is not installed on this Mac.")
            return
        }
        NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration())
    }

    /// Opens the attendance tracker's live dashboard at the address set in Settings.
    func openAttendance(address: String) {
        let trimmed = address.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else {
            show("Set the attendance dashboard’s address in Settings (⌘,).")
            return
        }
        guard let url = URL(string: trimmed.contains("://") ? trimmed : "http://\(trimmed)") else {
            show("“\(trimmed)” is not a web address.")
            return
        }
        NSWorkspace.shared.open(url)
    }

    // MARK: Export

    /// Saves the current form's document as a PDF.
    func exportCurrent() {
        switch destination {
        case .vouchers:
            PDFExport.save(VoucherPaper(voucher: voucher.voucher, model: self), named: "\(voucher.no).pdf", model: self)
        case .billing:
            PDFExport.save(StatementPaper(statement: statement.statement, model: self), named: "\(statement.no).pdf", model: self)
        case .idMaker:
            PDFExport.save(CardSheet(card: card.record, photo: photo(card.photo), model: self), named: "\(card.no).pdf", model: self)
        default:
            show("Open Check Vouchers, Billing Statements or the ID Maker to export a document.")
        }
    }

    /// Saves the current form.
    func saveCurrent() {
        switch destination {
        case .vouchers: saveVoucher()
        case .billing: saveStatement()
        case .idMaker: issueCard()
        case .directory: if addingRecord { addRecord() } else { addingRecord = true }
        default: break
        }
    }

}
