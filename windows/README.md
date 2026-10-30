# Keystone for Windows (WinUI 3) — not started

This folder already holds what the Windows app will share with the Mac app. It is generated from `/shared` by
`node scripts/sync-shared.mjs`, so do not edit it by hand:

- `Keystone/Theme/Tokens.xaml`: every colour, size and radius as XAML resources (`GoldBrush`, `SizeH1`, `RadiusCard`…)
- `Keystone/Assets/Fonts`: Orbitron and Poppins (OFL)
- `Keystone/Assets/logo.png`
- `Keystone/Assets/seed.json`: the sample data, in the same schema as the saved state

The port starts once the Mac prototype is signed off. See `docs/PORTING.md` for the Swift → C# map. Port the core and
its tests first, then the screens.
