# 0001. One codebase: Tauri 2 + React + TypeScript

Status: Accepted · Date: 2026-10-30. Supersedes the first plan: SwiftUI on the Mac, then a WinUI port.

## Context

The APG apps already use four different UI stacks:
- **The attendance tracker:** Tauri, React and TypeScript.
- **Branding Studio:** WPF, plus a separate SwiftUI app.
- **The website:** React and PHP.
- **Keystone's first prototype:** SwiftUI, with WinUI planned.

Writing each app twice (once per platform) doubles the work. Co-developers already work in TypeScript.

## Decision

Build Keystone once in Tauri 2 + React 18 + TypeScript, matching the attendance tracker's versions and tooling. Keep
native code to a small Rust layer: files, the keychain, launching apps.

## Consequences

- **Good:** one codebase for macOS and Windows, and one language across Keystone, the attendance tracker and the
  website front end. The UI can be tested in a browser, and the design-system checks run on it.
- **Cost:**
  - Controls are web-rendered rather than native.
  - The SwiftUI shell was retired. Its design, tokens, sample data and rules carried over.
- **Not the point:** the stack was chosen for one codebase, not as the cure for complexity. That comes from design
  (ADR 0002).
