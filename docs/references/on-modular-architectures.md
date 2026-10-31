# Reference: "On Modular Architectures"

> Param Rengaiah, *On Modular Architectures: What they are and why you should care.* On Software Architecture
> (Medium), 24 Feb 2014. Part I of a series.
> <https://medium.com/on-software-architecture/on-modular-architectures-53ec61f88ff4>

This is the article Keystone's modular-first design is measured against. Below are its ideas in brief, then how
Keystone applies each one, including where it doesn't yet. The short quotes are the article's own words; everything
else is a summary.

## The article in brief

1. **Architecture is structure.** The author sees software architecture as three things: the structure of a system,
   the process of creating that structure, and the documentation of it. Styles (layered, service-oriented,
   domain-driven…) are ways of *viewing* a system, and one system usually mixes several.
2. **Modular architecture** manages complexity by breaking a problem into smaller, manageable modules. As a style it
   comes with guidelines, principles and patterns.
3. **It goes a level below layers and services.**
   - A layered view distributes roles by technical function (presentation, business logic, data).
   - A service view focuses on how business functions talk to each other.
   - A modular view sees the system as a composition of smaller, **physical** modules.
4. **What a module is.** It quotes Kirk Knoernschild: a module is a *"deployable, manageable, natively reusable,
   composable, stateless unit of software that provides a concise interface to consumers"*. In Java, that is a JAR.
5. **What good modules do.**
   - They have a clear business context and stay within their enclosing physical layer.
   - They work within the context they are given, and express their scope through a public interface.
   - They help you understand, extend and manage the system both at design time and at run time: *design-time
     modularity and run-time modularity*.
6. **The focus is physical design:** *"how you design the physical composition of the application."* Logical
   grouping alone does not help.
7. **Tools don't make code modular.** *"Agility, comprehension and cohesiveness are and will always remain a function
   of design."* A framework, tool or new language may make it easier to manage, but cannot make code clean, simple and
   reusable.
8. **Why modularize: change arrives in small pieces.** An application lives through many small, quick changes. Done
   badly, they leave a codebase that is *"distributed, duplicated, chaotic, fragile and complex"*. Exposing functions as
   services doesn't fix that: *"Behind every functioning service, you may have a rotten codebase."* The root cause is
   often not the technology or the team but a design less modular than it seems. Being truly modular means going "all
   the way" in on physical design.
9. **Why now: a "2.0" is coming.** Apps are expected to go to the cloud, offer APIs, add mobile and touch, and be
   responsive. Almost every application will need a 2.0. Good modular design gives you the confidence to *"pivot your
   design choice anytime without paying high cost."*
10. **What to do: a modularity release first.** Before a major exercise, such as providing APIs or revamping the UI,
    do a release dedicated to modularity and the right physical design. It won't be easy.

## How Keystone applies it

| The article's idea | In Keystone | Status |
|---|---|---|
| Architecture = structure + process + documentation | **Structure:** kernel and parts (`docs/MODULARITY.md`).<br>**Process:** the rules and checks in `AGENTS.md`, enforced in CI.<br>**Documentation:** a README in every part saying what it owns, contributes and needs, and what removing it does. | Done |
| Modules are **physical** units, not logical groupings | **Packages:** `@keystone/core` and `@keystone/ui` are separate packages.<br>**Domains, modules, connectors:** each is a separate file or folder with its own README.<br>**Imports between parts:** a script fails the build when one part imports another (`npm run check:boundaries`). | Partly. Modules and connectors are folders inside one app package, not packages of their own (see "Going all the way") |
| A **clear business context** for each module | One module per business function: vouchers, billing, ID cards, directory. One connector per real system: the attendance tracker, Branding Studio, the website. | Done |
| **Confined to its enclosing layer** | Rules sit in the core layer (`packages/core/src/domains`), screens in the app layer (`apps/keystone/src/modules`), and access to other systems in `connectors`. Nothing reaches around the platform layer to Tauri. | Done |
| **Works within the context it is given** | A module gets `ModuleApp` (go, has, setDraft, state, ctx) and the kernel kit. A connector gets `ConnectorEnv` (http, system, secret, settings). Neither reaches for anything else. | Done |
| A **concise public interface** | `ModuleDef` and `Connector` are the whole interface. Overview and Home learn what a module offers from its contributions, never from its insides. | Done |
| **Composable** | `buildRegistry` composes whatever modules and connectors are listed. `main.tsx` is the only place that names them all. | Done |
| **Manageable** | Broken or incomplete parts are left out with a reason, shown under Connections. Missing requirements are declared with `requires`, and every connected system reports its health on its own card. | Done |
| **Stateless** | Modules hold no state of their own. Saved data lives in the kernel's store, and a module's own data goes under `state.ext[<id>]`, which survives builds without that module. | Done |
| **Natively reusable** | `@keystone/ui` doesn't depend on Keystone's rules, so the attendance tracker or the website admin could use it. The core domains are plain TypeScript functions. | Partly. Nothing outside Keystone uses them yet |
| **Deployable** | Parts are composed when Keystone is built; adding or removing one means a rebuild. Nothing is installed into a running copy. | Not yet (see "Going all the way") |
| **Design-time modularity** | The boundary check, folder READMEs and module/connector templates, all run in CI. | Done |
| **Run-time modularity** | At run time:<br>• each screen has its own error boundary;<br>• each connector call has a deadline and is isolated;<br>• the registry validates parts at start-up.<br>The removal test takes out each part in turn and renders everything left. | Done for isolation and validation. Not for loading or unloading parts while running |
| **Tools don't create modularity; design does** | Moving to Tauri + React was chosen for one codebase and one shared stack, not as the fix for complexity. The fix is the kernel-and-parts design, the contracts, and the checks that keep them honest. | The principle we follow |
| **Change arrives in small pieces** | Adding a screen or a system is one folder plus one line. Removing it is deleting the line. Nothing else changes. | Done |
| **"Behind every functioning service, you may have a rotten codebase"** | The connectors talk to three working systems. Keystone keeps its own side clean whatever is behind them: a failing system shows up on its own card and nowhere else. Changes to those systems are proposed for their own repos (`docs/ATTENDANCE-INTEGRATION.md`), not patched around. | Done |
| **The coming 2.0** | Whatever comes next (an office-network hub, mobile, APIs for the other apps) plugs in as a new connector or module, not a rewrite. | Ready for it |
| **A modularity release first** | Keystone did this: the modular-first restructure shipped before any further features. | Done |

## Going "all the way"

The article says that to be truly modular you go "all the way" in on physical design. Here is what that would mean
for Keystone, in order of value. None of it is needed for today's promise (any part can be removed without breaking
the rest):

1. **One package per module and connector.** For example `packages/modules/vouchers` or
   `packages/connectors/attendance`, each with its own `package.json` listing what it depends on (`@keystone/core`,
   `@keystone/ui`, and the kernel kit as `@keystone/kit`). The dependencies a part may have would then be stated in its
   manifest, not only checked by a script. This is the closest TypeScript equivalent of the article's JAR.
2. **Share the design system with the other APG apps.** Publish `@keystone/ui` (or an `@apg/ui`) so the attendance
   tracker and the website admin use the same components. That is the "natively reusable" property put to use.
3. **Install parts into a running copy.** Load modules and connectors from separate bundles at start-up instead of
   compiling them in. This brings run-time modularity all the way, at the cost of bundle signing and version checks;
   only worth it if Keystone gets parts maintained by other teams.

## Where this shows up in the repo

- `AGENTS.md`: the rules every agent and co-developer follows.
- `docs/MODULARITY.md`: the contracts (`ModuleDef`, `Connector`, domains), the saved state, and how each rule is
  checked.
- `scripts/check-boundaries.mjs` and `apps/keystone/src/test/removal.test.tsx`: design-time and run-time
  modularity, checked on every push.
