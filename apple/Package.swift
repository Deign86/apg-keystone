// swift-tools-version: 5.10
import PackageDescription

// KeystoneCore holds everything that is not drawing: models, numbering, tax math,
// amount in words, persistence. It imports Foundation only, so it builds on Linux
// too and maps one-to-one onto the C# core of the WinUI port (see docs/PORTING.md).
// KeystoneApp is the SwiftUI shell on top of it.
let package = Package(
    name: "Keystone",
    defaultLocalization: "en",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "KeystoneCore", targets: ["KeystoneCore"]),
        .executable(name: "Keystone", targets: ["KeystoneApp"]),
    ],
    targets: [
        .target(name: "KeystoneCore"),
        .executableTarget(
            name: "KeystoneApp",
            dependencies: ["KeystoneCore"],
            resources: [.copy("Resources")]
        ),
        .testTarget(name: "KeystoneCoreTests", dependencies: ["KeystoneCore"]),
    ]
)
