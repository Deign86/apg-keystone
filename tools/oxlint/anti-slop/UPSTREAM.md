# Vendored anti-slop Oxlint plugin

Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), commit `13909c9`. That is the commit the
`install-anti-slop` skill in `.agents/skills/install-anti-slop` was vendored from on 2026-10-31. This folder is a byte-for-byte copy of
that skill's `assets/anti-slop/`, made with its `scripts/install.mjs` on 2026-10-31. The skill folder is the
retained pristine snapshot for future updates (see the skill's `references/update.md`).

Installed paths:

- `tools/oxlint/anti-slop/index.ts`: the generic plugin, registered as `anti-slop` in `/.oxlintrc.json`.
- `tools/oxlint/anti-slop/effect/`: the opt-in Effect plugin. Copied but **not registered**, because no Keystone
  package depends on `effect` directly.
- `tools/oxlint/anti-slop/vendor/eslint-stylistic/`: the vendored padding rule, with its own `LICENSE` and
  `UPSTREAM.md`.

Dependencies: `oxlint` and `@oxlint/plugins`, both pinned to exactly `1.90.0` in the root `package.json`. Move them
together.

Configuration: every generic rule plus the native `oxc/no-accumulating-spread` is on at `"error"`. Agent tooling
folders, build outputs and this folder are ignored.

Intentional deviations from upstream: none. The upstream rule tests (`*.test.ts`) are not part of the skill bundle,
so they are not here.
