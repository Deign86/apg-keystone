# Porting Keystone to Windows (WinUI 3)

The Mac app is split so the Windows app can be a translation, not a redesign:

```
shared/            one source for tokens, fonts, logo, sample data  ──►  generated into both apps
apple/Sources/KeystoneCore   all rules, Foundation only, unit-tested  ──►  windows/Keystone.Core (C#)
apple/Sources/KeystoneApp    SwiftUI drawing only                     ──►  windows/Keystone (WinUI 3 XAML)
```

If a rule appears in a SwiftUI view, it is in the wrong place. Move it into `KeystoneCore` first, then port it.

## Core: Swift → C#

| Swift (`KeystoneCore`) | C# (`Keystone.Core`) | Notes |
|---|---|---|
| `LocalDate` | `DateOnly` | JSON as `"yyyy-MM-dd"`. |
| `Money` (Int64 centavos) | `readonly record struct Money(long Centavos)` | JSON as a number of pesos. Round with `MidpointRounding.AwayFromZero` in `Percent`. |
| `TerminalState`, `Voucher`, `Statement`, `IDRecord`, `DirectoryRecord`, `LogEntry` | `record` classes with `[JsonPropertyName]` | **Keep the JSON keys** (`dir`, `cv`, `bs`, `ids`, `log`, `desc`, `acct`, `amt`, `iceName`…) so a `state.json` moves between machines. |
| `VoucherStatus` etc. (raw values `"For Approval"`) | enums with a `JsonStringEnumConverter` and `[JsonStringEnumMemberName]` | |
| `Terminal` (struct, `mutating` methods) | `sealed class Terminal` | `save`/`issue`/`add` return `Saved<T>(record, message)` or throw `KeystoneException(message)`. |
| `Clock` | `TimeProvider` | Tests pin it to 30 Oct 2026 09:05 Asia/Manila. |
| `Format`, `AmountInWords` | static classes | Hand-written formats, not `CultureInfo`, so both apps print identical strings. |
| `VerificationCode.cells` | same algorithm with `uint` | Use `unchecked` multiply. Test against the same rows as `KeystoneCoreTests`. |
| `StateFile` | `StateFile` at `%LOCALAPPDATA%\Keystone\state.json` | Move a file that won't decode aside as `state.broken-<time>.json`. |
| `Seed.bundled` | load `Assets/seed.json` | |

Port `apple/Tests/KeystoneCoreTests` to xUnit **first**. The test values come from the web prototype, so passing
them proves the Windows core matches the Mac core.

## UI: SwiftUI → WinUI 3

| SwiftUI | WinUI 3 |
|---|---|
| `@Observable AppModel` | `AppViewModel : ObservableObject` (CommunityToolkit.Mvvm), `[ObservableProperty]`, `[RelayCommand]` |
| `RootView` (rail + `ScrollView`) | `Grid` with a 236px column for the rail, a `ScrollViewer`, and a `ContentControl` switched on `Destination` |
| `Rail` / `RailItem` | `ItemsRepeater` of buttons. Active item: gold key badge and a 1px gold `Border` on the right edge. Do **not** use the stock `NavigationView`, because its selection pill is off-style. |
| `KeyBadge`, `StatusPill`, `Eyebrow`, `ScreenHeader` | `UserControl`s with the same sizes from `Tokens.xaml` |
| `KeystoneButtonStyle` | three `Button` styles (`PrimaryButton`, `SecondaryButton`, `QuietButton`) with `PointerOver`/`Pressed` visual states |
| `Field` + `InputBox` | `TextBox`/`ComboBox`/`CalendarDatePicker` restyled: background `InputBrush`, border `LineBrush`, focused border `GoldBrush`, radius 5 |
| `Register` | `ItemsRepeater` with a `Grid` row template whose column widths match the Swift `Column`s |
| `FigureStrip` | one `Border` with a 4-column `Grid` and 1px column separators |
| `Workspace` (`ViewThatFits`) | `VisualStateManager` with an `AdaptiveTrigger` at 1100 effective px |
| `VoucherPaper` / `StatementPaper` / `CardSheet` | `UserControl`s on a white `Border` |
| `PDFExport` (`ImageRenderer` → CGContext) | `PrintManager` "Microsoft Print to PDF", or render with QuestPDF from the same core models |
| `NSOpenPanel` / `NSSavePanel` | `FileOpenPicker` / `FileSavePicker` (call `InitializeWithWindow`) |
| `openBrandingStudio` (bundle ID) | `Process.Start` on Alpha Branding's install path, or its registered protocol |
| `@AppStorage("attendanceAddress")` | `ApplicationData.Current.LocalSettings` |
| Go menu ⌘0–⌘6 | `KeyboardAccelerator` Ctrl+0–6 |
| `accessibilityReduceMotion` | `UISettings.AnimationsEnabled` |

The fonts are registered from `Assets/Fonts` through `Tokens.xaml` (`DisplayFont`, `BodyFont`).
