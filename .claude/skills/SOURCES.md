# Vendored skills

| Skill folders | Source | Commit |
|---|---|---|
| baseline-ui, component-canvas, create-canvas, create-design-md, fixing-accessibility, fixing-metadata, fixing-motion-performance, improve-ui, ui-skills-root | https://github.com/ibelick/ui-skills (MIT) | 59193a7 |
| design-taste-frontend (in `/.agents/skills`, linked from here; `LICENSE-taste-skill` is its licence) | https://github.com/Leonxlnx/taste-skill (MIT) | 12af471 |

The ui-skills registry is also wired up as an MCP server in `/.mcp.json` (`list_skills`, `get_skill`).
Taste Skill has no MCP server. To update, re-copy the `skills/` folders from a fresh clone into the folder named above.
The other skills in `/.agents/skills` (ponytail, unlazy, anti-slop, e2e, grill-me) list their sources in the commit
that installed them.
