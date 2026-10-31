# Modular architecture: Keystone's reference

This is what Keystone's modular-first design is measured against. It starts from one article. Param Rengaiah's *On
Modular Architectures* (2014) sets the goal well, but it predates most of what the field has learned since: the
microservices boom and its correction, architecture checked by tests, plugin platforms, and AI agents as
co-developers. So the article comes first, then what changed after it, then the principles Keystone follows and how
it meets each one. Short quotes are the sources' own words; everything else is summary. Sources are at the end.

---

## 1. Where we start: Rengaiah (2014)

> Param Rengaiah, *On Modular Architectures: What they are and why you should care.* On Software Architecture
> (Medium), 24 Feb 2014.

- **Architecture is structure.** The author treats it as three things: the structure of a system, the process of
  creating that structure, and its documentation. Styles (layered, service-oriented, domain-driven…) are ways of
  *viewing* a system, and real systems mix them.
- **Modularity goes a level below layers and services.**
  - A layered view divides work by technical function.
  - A service view divides it by how business functions talk to each other.
  - A modular view sees the system as a composition of smaller, **physical** modules.
- **What a module is.** It quotes Kirk Knoernschild: a module is a *"deployable, manageable, natively reusable,
  composable, stateless unit of software that provides a concise interface to consumers"*. In Java, that's a JAR.
- **What good modules do.**
  - They have a clear business context, stay in their layer, work within the context they're given, and express
    their scope through a public interface.
  - Modularity has to hold both *at design time and at run time*.
- **Design, not tools.** *"Agility, comprehension and cohesiveness are and will always remain a function of design."*
  Logical grouping isn't enough; the focus must be physical design.
- **Why it matters.** Change arrives in small pieces, and done carelessly it leaves code that is *"distributed,
  duplicated, chaotic, fragile and complex"*. Exposing services doesn't fix that: *"Behind every functioning service,
  you may have a rotten codebase."* A good modular design lets you *"pivot your design choice anytime without paying
  high cost"*, so before a big exercise (APIs, a UI revamp), do a release dedicated to modularity.

**What still holds:** physical design over logical grouping, design over tools, a concise interface, modularity at
both design time and run time, and a modularity release first.

**What has dated:**

| In 2014 | Since then |
|---|---|
| The modular platforms it names were still arriving: Java's Jigsaw was in progress, and JavaScript had no native modules | Java 9 shipped the module system (JPMS) in 2017. JavaScript got native ES modules (ES2015), and TypeScript projects and npm workspaces make packages first-class |
| SOA and "the cloud" as the next wave, with services seen as the route to modularity | A decade of microservices, then a correction: distribution is a deployment choice, not a modularity strategy (§2.1) |
| Modularity kept by discipline and good intentions | Modularity checked by architecture tests in CI (§2.2) |
| A module defined as "deployable" and "stateless" | Most modules today are compiled together and deployed as one. What matters is that each can be *replaced or removed* independently and *owns its data* behind a contract (§3) |
| "People at the center", stated but not developed | Team Topologies and Conway's law make module boundaries a question of team cognitive load (§2.5) |
| Documentation as part of architecture, with no format given | Architecture Decision Records, per-folder READMEs, and `AGENTS.md` for AI agents (§2.6) |

---

## 2. What the field learned after 2014

### 2.1 The microservices correction: the modular monolith

- **Monolith first.** Martin Fowler's *MonolithFirst* (2015) argues for starting new systems as a monolith. He calls
  the cost of running many services the "microservice premium". He also warns that it takes *"a lot, perhaps too
  much, discipline to build a monolith in a sufficiently modular way"*.
- **The modular monolith became the default answer:** one deployable, strong internal boundaries.
  - Kamil Grzybek's widely cited reference implementation (2019): each module is a bounded context that owns its
    data, and modules talk in memory through contracts and events.
  - Shopify's Packwerk (2020) enforces boundaries inside one of the largest Rails codebases.
  - Spring Modulith (2022) verifies module structure in a test and generates documentation from it.
- **Splitting isn't always a gain.** Amazon Prime Video's 2023 write-up described moving one monitoring service from
  distributed serverless components into a single process, cutting its infrastructure cost by over 90%.

**The lesson:** keep "is it modular?" separate from "is it distributed?". Get the boundaries right inside one
deployable, and you can split a module out later if a real need appears.

### 2.2 Architecture you can test: fitness functions and boundary checks

- *Building Evolutionary Architectures* (Ford, Parsons, Kua; 2017, 2nd ed. 2022) introduced **architectural fitness
  functions**: *"an objective integrity assessment of some architectural characteristic(s)"*, in effect unit tests
  for the architecture, run in CI.
- Boundary checks are the most common kind:
  - **Java and Spring:** ArchUnit, and Spring Modulith's `verify()`.
  - **Rails:** Packwerk.
  - **JavaScript and TypeScript:** Nx `enforce-module-boundaries`, dependency-cruiser, eslint-plugin-boundaries.
  - **Python:** import-linter.
- **Lessons from practice:**
  - **Boundaries erode unless a broken one fails the build.** Report a violation as an error, not a warning.
  - **A clean dependency graph isn't the goal.** Shopify's retrospective on Packwerk (Packwerk 3.0 removed its
    privacy checks) warns that chasing a tidy graph pulled attention from the actual goal: code that is easier to
    change.
  - **Static checks have blind spots** (code generated at run time), so pair them with behaviour tests.
  - **Too many fitness functions** can make a system harder to change, the opposite of the intent.

### 2.3 Plugin platforms: contribution points and isolation

Modern extensible products show how "composable" and "manageable" work at scale. VS Code is the clearest example:
- **A manifest of contributions.** Each extension declares *static contribution points* (commands, menus, views) in
  its manifest, which the editor reads at start-up without running the extension's code.
- **Lazy loading.** The extension's code loads only on specific *activation events*.
- **Isolation.** Extensions run in a separate host process, so *"a misbehaving extension cannot impact VS Code"*.

The pattern: the host knows parts by what they *declare*, loads them as late as possible, and contains their
failures.

### 2.4 The older, deeper theory, still the best guide

- **Parnas (1972), *On the Criteria To Be Used in Decomposing Systems into Modules*.** Decompose by the **design
  decisions likely to change**, each hidden behind an interface, not by the steps of a flowchart. This is
  *information hiding*, the root idea behind everything above.
- **Ousterhout (2018), *A Philosophy of Software Design*.**
  - **Deep modules:** a simple interface with substantial functionality behind it. Shallow modules (a big interface
    for little behaviour) are a net cost.
  - **Information leakage:** the same design decision showing up in several modules is a red flag.
- **Robert C. Martin's component principles:**
  - *Acyclic Dependencies:* no cycles between components.
  - *Stable Dependencies:* depend in the direction of stability. Instability is fan-out ÷ (fan-in + fan-out).
  - *Stable Abstractions:* stable components should be abstract.

### 2.5 People: Conway's law and cognitive load

- **Conway's law:** a system's structure mirrors its organisation's communication structure.
- **Team Topologies** (Skelton and Pais, 2019) turns that into a design rule:
  - Size a module to what the team that owns it can hold in mind (its **cognitive load**).
  - Design the team structure you want the architecture to have (the "inverse Conway manoeuvre").
- This is the concrete form of Rengaiah's "people at the center". A module boundary is also a boundary of
  understanding.

### 2.6 Documentation that machines and newcomers can follow

- **Architecture Decision Records** (Michael Nygard, 2011) record each significant decision with its context and
  consequences, and keep superseded ones.
- **`AGENTS.md`** (2025) is an open, plain-Markdown format for instructing AI coding agents, supported by most coding
  agents. Files can be nested, with the nearest one taking precedence. Its stewardship has been reported as moving to
  a Linux Foundation body.
- With agents writing code alongside people, **modularity also means legibility**. Each part says, where an agent
  will look, what it owns, what it may touch, and how to check it.

---

## 3. A module, defined for 2026

Keeping Knoernschild's five properties, read with what the field has learned since:

| 2014 property | What it means now | How Keystone meets it |
|---|---|---|
| **Deployable** | **Independently removable and replaceable**, and independently *testable*. Deploying separately is a later option, not a requirement (§2.1). | Delete one line and the part is gone (`removal.test.tsx`). |
| **Manageable** | It has a **health and a lifecycle** the host can see and contain (§2.3). | Registry validation, `requires`, per-connector health, per-screen error boundaries. |
| **Natively reusable** | Reusable **through its contract**, not by copying code. | `@keystone/ui` has no Keystone rules in it; core domains are pure functions. |
| **Composable** | The host knows it only by **what it declares** (§2.3). | `ModuleDef` and `Connector` contributions; Overview and Home name no module. |
| **Stateless** | It **owns its data behind a contract** and shares none of it by reference (§2.1). | Mostly: see trade-off T1 below. |
| *(new)* **Deep** | A **small interface over real behaviour** that hides a decision likely to change (§2.4). | Each connector hides one system's API; each domain hides one area's rules. |
| *(new)* **Legible** | It **documents itself where people and agents look** (§2.6). | A README in every part; `AGENTS.md`. |

---

## 4. Keystone's principles

Each principle gives its source, what Keystone does, and how it's checked.

| # | Principle | From | In Keystone | Checked by |
|---|---|---|---|---|
| P1 | **Decompose by what changes together.** One part per business function or external system. | Parnas; Rengaiah's "business context" | One package per module (a screen and its area's rules) and per connector (one APG system); the directory is shared kernel. | Review; package READMEs |
| P2 | **Physical boundaries, enforced.** A part never depends on another part; the kernel never depends on a part. | Rengaiah; Packwerk, Nx, ArchUnit | Each part is a package; its `package.json` declares what it may use, and `scripts/check-boundaries.mjs` fails CI on an undeclared import or a dependency its layer may not have | CI (verified by planting twelve violations) |
| P3 | **Dependencies point toward stability.** No cycles. | Martin (ADP, SDP) | Parts → kit → core and ui; core and ui depend on nothing in Keystone. Parts that need each other's behaviour meet at a service contract in core. | Boundary check |
| P4 | **Known by contributions, not references.** The host composes what parts declare. | VS Code contribution points; OSGi services | `ModuleDef` and `Connector` fields; registry-built Overview, Home, Activity; named services (`provides`, `app.service`) | Removal, contract and services tests |
| P5 | **Removable and testable alone.** | The 2026 reading of "deployable" | Delete one line and one manifest entry | `removal.test.tsx` (every module and connector removed in turn, and installed alone) |
| P6 | **Contain failure at run time.** | VS Code extension isolation; Rengaiah's run-time modularity | Per-screen error boundaries, a deadline on every connector call, broken parts refused with a reason | `packages/kit/test/runtime.test.ts`, removal test |
| P7 | **Deep modules.** Small interfaces that hide decisions likely to change. | Ousterhout | Connectors hide each system's API, auth and quirks; rules hide VAT and EWT, numbering and wording | Review: leaks are a red flag |
| P8 | **Architecture as tests.** Every promise has a fitness function. | Ford, Parsons, Kua | `npm run check`: theme sync, boundaries, types, tests, design lint | CI on every push |
| P9 | **One deployable until a real need says otherwise.** | Fowler; modular monolith practice | One Tauri app; the attendance roster hub is proposed, not assumed | ADRs |
| P10 | **Legible to people and agents.** | Nygard; `AGENTS.md`; Team Topologies | `AGENTS.md`, a README per part, `docs/adr/` | Review |

## 5. Known trade-offs (where Keystone departs, on purpose)

- **T1: Shared saved state.**
  - **The departure:** Modern modular-monolith practice says each module owns its data. Keystone keeps the
    prototype's single document (`dir`, `cv`, `bs`, `ids`, `log`) so existing backups keep working. New modules store
    their data under `state.ext[<id>]`, which is properly owned.
  - **Why it's acceptable:** the directory is deliberately a *shared kernel*, in DDD terms. It's master data every
    area refers to by code.
  - **What would change it:** moving the older areas into `ext` behind accessors, the day a format version bump is
    worth it (see ADR 0003).
- **T2: Compiled in, not plugged in at run time.**
  - **The departure:** Parts are composed when Keystone is built.
  - **Why it's acceptable:** loading parts from separate bundles adds signing, versioning and compatibility work.
    That pays off only when other teams ship parts.
  - **What would change it:** declarative manifests first (§6), runtime loading only if needed.
- **T3 (resolved): Folders, not packages.** Keystone started with modules and connectors as folders, checked by a
  script. Since ADR 0005 each one is an npm workspace package with its own manifest, rules and tests, the modern
  equivalent of the article's JAR. The script now checks manifests, which is a stronger guarantee: a dependency has to
  be written down before it can be used.

## 6. Where to go next (in order of value)

1. **Write an ADR for each significant change.** The format and the first records are in `docs/adr/`.
2. ~~**Make each part a package**~~ Done (ADR 0005): `packages/modules/*` and `packages/connectors/*`, each with its own
   manifest, rules and tests, and a service registry for the one place two parts cooperate.
3. **Add a static contribution manifest:** each part's title, rail order, Home tile and log tags in data, VS Code
   style. Keystone could then show a part before loading its code, and lazy-load heavy screens.
4. **Add more fitness functions, but few:**
   - **A cycle check inside the kernel** (ADP).
   - **A bundle-size budget per module.**
   - **An "owns its data" check for `ext`.**
   - Stop there: too many checks freeze a design (§2.2).
5. **Give each part an owner** (a CODEOWNERS entry), sized so one person or pair can hold it in mind, per Team
   Topologies.
6. **Share the design system** with the attendance tracker and the website admin as an `@apg/ui` package.

---

## Sources

**Primary reference**
- Param Rengaiah, *On Modular Architectures* (2014): https://medium.com/on-software-architecture/on-modular-architectures-53ec61f88ff4

**Monoliths, microservices and modular monoliths**
- Martin Fowler, *MonolithFirst* (2015): https://www.martinfowler.com/bliki/MonolithFirst.html
- InfoQ on the microservice premium: https://www.infoq.com/news/2015/05/microservices-premium
- InfoQ on Kamil Grzybek's modular monolith with DDD: https://www.infoq.com/news/2019/09/design-ddd-modular-monolith
- Coverage of the Prime Video 2023 case: https://devclass.com/?p=5603 · https://www.thestack.technology/amazon-prime-video-microservices-monolith/

**Boundary enforcement and fitness functions**
- Shopify, *A Packwerk Retrospective*: https://shopify.engineering/a-packwerk-retrospective
- Spring Modulith: https://spring.io/projects/spring-modulith · https://spring.io/blog/2022/10/21/introducing-spring-modulith
- Nx, enforce module boundaries: https://nx.dev/docs/features/enforce-module-boundaries.md
- *Building Evolutionary Architectures*, ch. 2, Fitness Functions: https://oreilly.com/library/view/building-evolutionary-architectures/9781491986356/ch02.html
- Thoughtworks Radar, architectural fitness function: https://thoughtworks.com/radar/techniques/architectural-fitness-function

**Plugin platforms**
- VS Code extension anatomy and contribution points: https://code.visualstudio.com/api/get-started/extension-anatomy.md · https://vscode-docs1.readthedocs.io/en/latest/extensionAPI/extension-points/
- VS Code, our approach to extensibility (isolation): https://vscode-docs1.readthedocs.io/en/stable/extensions/our-approach/
- OSGi Core, the service layer (providers register a service by name; consumers look it up and cope with its absence): https://docs.osgi.org/specification/osgi.core/8.0.0/framework.service.html
- npm workspaces (one manifest per package in one repository): https://docs.npmjs.com/cli/using-npm/workspaces

**Theory**
- D. L. Parnas (1972), commentary and notes: https://blog.acolyer.org/2016/09/05/on-the-criteria-to-be-used-in-decomposing-systems-into-modules/ · https://cs.uwaterloo.ca/~dberry/parnas.html
- John Ousterhout, *A Philosophy of Software Design*, reviews: https://blog.pragmaticengineer.com/a-philosophy-of-software-design-review/ · https://freshman.tech/philosophy-of-software-design-summary
- Robert C. Martin, component coupling principles: https://www.codeproject.com/Articles/1278194/Software-Component-Principles-Revisited

**People and documentation**
- Team Topologies, notes and summaries: https://github.com/arjenderuiter/arjenderuiter.github.io/files/13794087/Summary_of_Team_Topologies.pdf
- ADRs (Nygard's format): https://faq.arc42.org/questions/C-9-3/
- `AGENTS.md`: https://agentic-ai.readthedocs.io/en/latest/Standards/agents-md/ · https://roostorg.github.io/community/software-development-practices/agents.html

Some of these are secondary summaries. Where a figure or quote matters (Prime Video's "over 90%", the `AGENTS.md`
governance), check the primary source before relying on it.
