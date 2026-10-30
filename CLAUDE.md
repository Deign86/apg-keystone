# Claude Code

Read and follow @AGENTS.md. It is the single set of instructions for every agent and co-developer on Keystone.

In short: Keystone is modular-first. A module, a connector or a core domain never imports another one. Parts
contribute through `ModuleDef` and `Connector`; links between screens go through `useModuleApp().has()`. Run
`npm run check` before you commit.
