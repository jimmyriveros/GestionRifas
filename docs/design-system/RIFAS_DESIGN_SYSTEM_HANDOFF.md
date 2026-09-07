# Rifas Design System — Session Handoff

**Last approved migration:** **WAVE 4.5B — STATUS SEMANTIC MIGRATION** (all 27 mappings APPROVED, 2026-09-06)


**Wave 1 — semantic token infrastructure:** COMPLETED AND APPROVED · commit `3aae867`
**Wave 2 — typography:** COMPLETED AND APPROVED · commit `b33003e`
**Wave 3A — core controls adoption:** COMPLETED AND APPROVED · commit `c723b99`
**Wave 3B1 — brand semantic convergence:** COMPLETED AND APPROVED · commit `64aaeed`
**Wave 3B1b — brand activation prerequisites:** COMPLETED AND APPROVED · commit `64f22c5`
**Wave 3B2 — brand activation:** COMPLETED AND APPROVED · commit `7a851f8` · **THE BRAND IS LIVE**
**Wave 4 — data display & overlays:** COMPLETED AND APPROVED · commit `e48e2c8`
**Wave 4.5A — status semantics audit:** COMPLETED AND APPROVED · documentation commit `dbba151`
**Wave 4.5B — status semantic migration:** COMPLETED AND APPROVED · commit `85fc38f` — **all 27 state
mappings approved** (14 explicit + 13 rule-derived); the gate passed on 2026-09-06.
**Wave 5 — navigation & shell:** **RE-SCOPED EXECUTION COMPLETED AND APPROVED** · commit in §11
  — 2 files, 4 changes; the original headline navigation work was pre-empted by 3B2 (§10.19)
**NOT AUTHORIZED:** the next migration wave. **Wave 6 — Data visualisation** is next in the plan and
its colour work is **entirely intact** (`data/*` still has zero consumers), though 4.5B de-risked it by
settling the Status side of the `data/partial` question. Wave 7 (patterns + the Clientes pilot)
follows. **Alert/Notice is an unassigned component gap and a PILOT PREREQUISITE.**
**Current status:** DESIGN SYSTEM CORE v1 — READY WITH DOCUMENTED DEBT
**Migration branch:** `design-system/migration` (from `main` @ `124445b`; `main` not moved)
**Handoff written:** 2026-09-06 · **last updated:** 2026-09-06 (Wave 4)

> **Wave 1** — `src/app/globals.css` **+647 / −0**, additive, zero consumers; the compiled-CSS diff
> proved **no existing declaration changed** (0 removed lines).
> **Wave 2** — **20 files**: the 14 typographic roles in `globals.css` (+114 / −0) plus
> **38 shared-component typography migrations** across 18 files (38 insertions / 38 deletions, no
> logic). **Intentional visual changes: none** — every migrated pair proved numerically identical.
> The one computed-value delta is deliberate: migrated elements go from inheriting
> `letter-spacing: normal` to an explicit **`0px`** (identical rendering in Geist; a role that does
> not pin its own tracking is not a complete role).
>
> **Wave 3A** — 7 control files, 24 replacements: only tokens proved identical in all three scopes.
> Adds the Button touch sizes without changing any default. **No intended visual change** (§10.8).
>
> **Wave 3B1** — 11 files, 19 replacements: `text/brand` and `focus/ring` adopted behind a SECOND
> fenced pin block. Navigation, selection, progress and the generic Badge default were **deferred**
> because no pin can bridge them without a design decision (§10.10).
>
> **Wave 3B1b** — analysis plus ONE inert code change: the generic Badge default was decoupled from
> `action/primary`, because the approved system has no generic Badge at all (§10.12).
>
> **Wave 3B2** — **THE BRAND IS ACTIVE** in Light and Dark; Catalog's action and focus roles do not
> move. Both pin blocks deleted; navigation, selection and the drag-active state migrated to their
> approved treatments. 29 of 30 contrast pairs pass — the one failure is an **unreachable** Catalog
> pair (§10.14).
>
> Still true after every wave so far:
> **the brand IS activated (Waves 1-3B1 kept it pinned; 3B2 released it)** ·
> **`data/partial` still deferred to the Data wave** · **no legacy variable removed** ·
> **`npm run test:db` NOT RUN** (see §10.4).

This is the **single living handoff** for the Design System track. It is written so a new
Claude Code session can continue with **no access to previous chat history**. Read it in
full at the start of every session (§14 is the startup checklist).

The Design System track is governed by the master prompt at `C:\Users\USER\Desktop\Designsystem.txt`
(user-local, not in the repo). It runs **alongside** the application phases governed by
`CLAUDE.md`; it does not replace them. `docs/HANDOFF.md` remains the operational relevo for
application work — this file is only for the Design System.

---

## 1. What this project is

A Colombian raffle-management web application (`D:\Claude\Personal\Rifas`) — Next.js App
Router, TypeScript strict, Supabase + Postgres with RLS, Tailwind v4, shadcn/ui (new-york),
TanStack Table, lucide-react, Geist. Spanish interface, COP currency, `America/Bogota`.
Owner/Admin and Seller portals, plus a public Catalog surface.

The Design System track built a complete Figma design system from the shipped product, produced the
contract for migrating the product onto it, and has now executed **Waves 1, 2 and 3A** of that
migration. Waves 1 and 2 are approved and committed; 3A is uncommitted. **The product is live**, and
**none of the three introduced an intended visual change**, so it still looks exactly as it did.
Wave 3 was split into **3A (core-control adoption)** and **3B (brand activation)** precisely so that
the visible flip stays a separate, separately reversible decision. **3B is where the appearance
actually changes, and it is not authorized.**

---

## 2. Source of truth

**PRIMARY DESIGN SOURCE OF TRUTH: Figma — Rifas Design System**

- URL: https://www.figma.com/design/7KIwO0iiGpksLSNjMeSa4X/Rifas-%E2%80%94-Design-System
- File key: `7KIwO0iiGpksLSNjMeSa4X`
- Access: `use_figma` MCP tool. **Load the `figma-use` skill before every call**
  (`skillNames: "resource:figma-use"`). Figma plugin state does **not** persist between calls —
  re-locate nodes by name each time.

### Pages

| Page | Contents |
|---|---|
| `00 — Start Here` | Entry point. Decision log (DS-001…DS-115), core decisions, naming, theme modes, responsive rules, **Component Readiness Matrix**, code-readiness mapping, token to code mapping, **Future code reconciliation**, Design-to-Code pointer |
| `01 — Foundations` | Colour, typography, spacing, radius, elevation, focus specimens |
| `02 — Components` | All component sets and singles |
| `03 — Patterns & Screens` | **Reserved — currently empty (0 nodes, verified 2026-09-06).** The Product Patterns, Application Shell, Sidebar and Page / Header all live on `02 — Components`. Do **not** move them to satisfy this name; reorganising is a future dedicated cleanup phase, never an implicit task. |
| `04 — Design to Code` | **The Phase 11 migration contract** — 16 sections (see §8) |

**Before executing any migration work, read `00 — Start Here` and `04 — Design to Code`.**

Canonical locations inside Figma:

- **Decision log** → `00 — Start Here` › Section · Decision log
- **Component Readiness Matrix** → `00 — Start Here` › Section · Component readiness
- **Future code reconciliation** → `00 — Start Here` › Section · Future code reconciliation
- **Migration waves** → `04 — Design to Code` › Section · Implementation waves
- **Token contract** → `04 — Design to Code` › Section · Token contract
- **Accessibility contract** → `04 — Design to Code` › Section · Accessibility implementation contract
- **Theme contract** → `04 — Design to Code` › Section · Theme migration

Do not copy Figma content wholesale into this file. Summarize and point.

---

## 3. Completed phases

| Phase | Outcome |
|---|---|
| **0 / 0.5** | Audited the existing file and the shipped product; encoded the user's authoritative decisions. The Phase 0 audit was wrong (reported the file empty) and was corrected openly — `get_metadata` without a nodeId returns one page, and `search_design_system` only indexes *published* assets. |
| **1** | Foundations: primitive → semantic → role variable architecture, three colour modes, typography scale, spacing, radius, elevation, focus. Contrast measured in-script per mode with alpha compositing. |
| **2** | Core components: Button, Input, Select, Checkbox, Switch, Badge, Card. Variant explosion avoided deliberately. |
| **3** | Iconography (canonical lucide geometry converted to Figma-safe paths) and composite controls. |
| **4** | Data display: Table, header/row/cells, pagination, empty states, skeleton. |
| **5** | Responsive data display: List / Record, card lists, filter sheet, horizontal scroll, validated at 375 / 768 / 1360 / 1600. |
| **6** | Overlays (Dialog, Sheet, Menu, Tooltip, Scrim), ~44px touch targets, structural debt closure. Destructive dialogs must remain Escape-dismissible. |
| **7** | System QA and code-readiness audit. Declared **CORE v1 READY WITH DOCUMENTED DEBT** — the stable baseline. |
| **8** | Navigation and Application Shell: Sidebar (expanded / collapsed / overlay), bottom nav, Page Header, account menu. Corrected the inverted 1360 breakpoint claim (DS-070). |
| **9** | Product Patterns: List Page, Detail Page, Form, Search & Filters, Bulk Selection. |
| **10** | Dashboard and Data Visualization: Metric, Chart / Line, Chart / Donut, `data/*` roles audited from `tones.ts`. |
| **11** | Design-to-Code contract and migration plan — page `04 — Design to Code`. **No code written.** |
| **12 · Wave 1** | **Semantic token infrastructure.** 152 distinct `--ds-*` tokens (colours across all three scopes), 121 contract names exported via `@theme static inline`, brand pinned to today's value. One file: `src/app/globals.css`, +647 / −0. The first phase of this track to write production code. **Approved, committed `3aae867`.** |
| **12 · Wave 3A** | **Core controls adoption.** Button, Badge, Input, Textarea, Select, Checkbox and Switch move onto the semantic tokens that were proved byte-identical in Light, Dark and Catalog; Wave 2 typography completed inside them; two new Button sizes express the 44px touch target without changing any default. **Focus could NOT be migrated** — `focus/ring` aliases `brand/default`, which the pin does not cover, so adopting it would BE the brand flip. Uncommitted. |
| **12 · Wave 2** | **Typography.** The 14 Figma text styles installed as `--text-*` roles, one utility per role (`Heading/H3`, `Body/Small`, `Label/Medium`, …), then 38 ad-hoc utility swaps across 18 shared components. Sizes and line-heights proved numerically identical to the utilities they replaced. **No brand, no colour token, no component family from Waves 3–6 adopted anything.** **Approved, committed** (hash in §11). |

---

## 4. Current inventory — verified 2026-09-06

| Asset | Count |
|---|---|
| Variables (total) | **267** |
| — Primitives (1 mode) | 114 |
| — Color (3 modes: Light · Catalog · Dark) | 85 |
| — Dimensions (1 mode) | 43 |
| — Typography (1 mode) | 25 |
| Component sets | **32** |
| Variants (inside those sets) | **201** |
| Single components (non-icon) | **16** |
| Icon components | **41** |
| Text styles | **14** |
| Effect styles (elevation) | **3** — Subtle · Default · Strong |
| Paint styles | 0 (colour is variables only, by design) |

### Families available

- **Foundations** — colour, typography, spacing, radius, elevation, focus
- **Core controls** — Button, Button / Icon, Input / Text, Input / Search, Select, Checkbox, Switch, Card, Dropdown
- **Status** — Badge / Status
- **Data display** — Table, Table / Header cell, Table / Row, Table / Toolbar, Table / Pagination, Table / Empty state, Table / Skeleton, Cell / Text · Numeric · Status · Selection · Actions
- **Responsive records** — List / Record, List / Group, Scroll / Horizontal, Sheet / Filters (sample)
- **Overlays** — Dialog, Sheet / Bottom, Sheet / Right, Menu / Item, Menu / Surface, Menu / Account, Tooltip, Overlay / Scrim
- **Navigation** — Navigation / Item, Navigation / Bottom, Sidebar, Page / Header
- **Application Shell** — Application Shell
- **Product Patterns** — Pattern / List Page, Pattern / Detail Page, Pattern / Form, Pattern / Bulk Selection
- **Metrics / Charts** — Metric, Chart / Line, Chart / Donut, Progress / Linear

---

## 5. Approved decisions that must NOT be reopened

Full text: `00 — Start Here` › Decision log (DS-001 … DS-115). The ones that matter to migration:

**DESIGN AUTHORITY**
- The approved Figma Design System is now the visual/design authority.
- Apple HIG (UX principles) and Atlassian (architecture) were **references during construction**.
  Migration sessions must **not** redesign from them unless a real contradiction is discovered — and
  then report it, do not act unilaterally.
- Rifas owns brand identity. No third-party design system is a visual or structural authority.

**NAMING**
- Internal Design System naming is **English**. Visible product copy is **Spanish**, governed by
  `docs/UX_COPY_GUIDELINES.md` (imported into `CLAUDE.md` §35 — binding for any user-visible text).

**TOKEN ARCHITECTURE**
- Primitive → Semantic → Role. Maximum alias depth 3.
- Components must **never** consume raw primitive colours directly.
- Brand is replaceable by re-pointing tokens, not by editing components.
- Export rule: `Color` path → `--color-<path>` (lowercase, `/` becomes `-`). Primitives are **not**
  exported: they exist to be aliased, and shipping them invites components to reach past the
  semantic layer.
- Figma variable names are **not** renamed to suit code.

**BRAND**
- The admin product must have recognizable Rifas brand presence. Brand green is intentional and restrained.
- **Brand is not semantic Success.** Separated deliberately in Phase 1, so a green button never reads
  as "this succeeded".

**THEMES**
- Light, Dark and Catalog are **modes of one semantic architecture**, not three systems.
- The admin shell applies to Light/Dark. Catalog is a different product context and must not receive
  irrelevant admin patterns.
- A component must **never** branch on theme. If it needs to know the theme, the token layer is wrong.

**STATUS**
- Roles: `success`, `warning`, `error`, `info`, `neutral`, each with surface / foreground / border / icon.
- **Status is never communicated by colour alone.** No text-free status variant may be added.
- The Spanish status labels live in `src/lib/constants.ts` and are not improvised.

**TYPOGRAPHY**
- Geist Sans. **Semantic typography roles are the authority** — code asks for `Heading/H3`, never `20px`.
- Production currently has **no** type-token layer at all; Wave 2 creates it.

**RESPONSIVE**
- 375 reference · 768 mobile/navigation transition · **below 1360 the sidebar is collapsed** ·
  **at/above 1360 the sidebar opens at 208** · expanded width is fluid 208 → 232, reaching 232 at 1600.
- **Do not resurrect the old incorrect "collapses at 1360" statement** (corrected in DS-070). Content
  width *dips* at 1360 (1255 → 1104), which is safe because 1104 clears the 1050px critical table.
- 1440 is not an automatic breakpoint.

**ACCESSIBILITY**
- Approximately 44px minimum touch targets where applicable.
- Icon-only controls require accessible names in code (`aria-label`); a tooltip is not a substitute.
- Modal focus behaviour (trap, restore, Escape) belongs to code. Destructive dialogs stay dismissible.
- Colour is reinforcement, never the only information signal.

**FIGMA IS NOT CODE IMPLEMENTATION**
- Figma implementation limitations must **never** dictate public component APIs. The binding list is
  `04 — Design to Code` › Section · Figma constraints that must NOT leak into code.

**PRODUCT BOUNDARY**
- The test: could this exist unchanged in an application that has nothing to do with raffles?
  No → Product Component, built on the system, never inside it.
- Product Components: `StatusBadge`, `CollectionSummaryCard`, the ticket-number pair, the payment
  allocation form, the clearance-receipt switch, the seller catalog card, the lottery results card.
- The system must never learn a Rifas word — with **one deliberate exception**: the `data/*` role
  names (`paid`, `partial`, `unpaid`, `pending`) keep product meaning and are **not** renamed to
  `series-1/2/3`.

**WAVE 1 IMPLEMENTATION DECISIONS — approved 2026-09-06.** These four were reviewed and accepted.
Do **not** revert any of them merely to mirror the original conceptual contract more literally.

- **`@theme static inline` stays.** Wave 1 has zero consumers by design, so plain `@theme inline`
  let Tailwind tree-shake every contract variable out of the build. The semantic contract must remain
  emitted throughout the incremental migration. Replace `static` only if later production adoption
  makes it objectively unnecessary **and** that cleanup is explicitly scoped.
- **Single-mode scalars are declared once.** Spacing, radius, breakpoints and typography dimensions
  are mode-independent in Figma and need no redundant copies in `.dark` / `.catalog-theme`. One
  authoritative declaration is correct.
- **Framework correctness beats naming symmetry.** Design System contract names are **not** routed
  mechanically through Tailwind namespaces when that would change existing Tailwind semantics. The
  `100` padding utility probe demonstrated a real collision (25rem → 4px). See §7F for the four
  resolved cases.
- **`data/partial` is infrastructure only** — created, inert, zero consumers. The visual
  reconciliation stays deferred to the Data wave. It was **not** resolved in Wave 2.

**WAVE 2 DECISIONS — approved 2026-09-06.**

- **A role plus an explicit weight is a legitimate composition.** The two combinations Wave 2 found
  without a matching role are **not** automatically missing roles. For 16–18px at weight 600 (dialog
  titles), `Body/Large` + an explicit `font-semibold` is the accepted answer: the heavier weight is
  **local emphasis**, not a new recurring content role. **Do not invent a role solely to delete a
  `font-semibold`.**
- **The 30px/700 collection figure is a Product Component concern.** `CollectionSummaryCard` is
  already classified as a Product Component (§5, Product boundary). **Do not add a Core typography
  role for one business-specific hero figure.** It is recorded for the future Product Component
  migration.
- **The bar for a new role:** a *second* meaningful, recurring semantic use must demonstrate that it
  belongs in the shared system. One site is not a role.
- **`tabular-nums` stays a code behaviour, not a token.** It is applied where numeric alignment
  requires it and is **not** to be converted into a size/style token.

---

## 6. Current structural status

**READY**
- Foundations
- Core Components
- Data Display
- Responsive Data Display
- Overlays
- Navigation / Application Shell
- Product Patterns
- Dashboard / Data Visualization
- Design-to-Code Contract

**READY WITH DOCUMENTED DEBT**
- Core v1 overall

**Partial families — exactly as the Figma Readiness Matrix reports them:**

| Family | Column | Status |
|---|---|---|
| Icons (41) | Code-ready | `Partial · 41 of 73 production icons` |
| Progress / Linear | Code-ready | `Partial · steps are a Figma limit, code is continuous` |

`Collection summary` appears in the matrix marked `Product component, not Core` — that is a
classification, not a readiness status. No other family is Partial. Do not invent new status
categories.

---

## 7. Known documented debt

Classified so a migration session knows what is actually a code task. **Figma-only constraints are
not code blockers.**

### A. DESIGN SYSTEM DEBT

- **Icon coverage** — 41 of the **73** distinct lucide icons used in production exist in Figma.
  Expansion is mechanical through the established converter. Not a blocker.
  *Corrected 2026-09-06 at HEAD `124445b`: the count was stated as 77 in Phase 0 and carried forward
  unchecked. Re-measured across every `lucide-react` named import in `src/` (91 files) it is **73**
  distinct icons; the 91-file figure was right. The three decision-log entries that recorded 77 keep
  their original wording plus a dated correction clause — they are history, not current fact.*

### B. PRODUCTION CODE RECONCILIATION (the 15-item verified backlog on `04 — Design to Code`)

- **Status colours** — `StatusBadge.tsx` carries 10 hardcoded palette classes (amber-, sky-, emerald-,
  rose-, slate-) plus their dark twins. Replace with `status/*` tokens.
- **Duplicate success/warning** — `--success` and `--warning` exist in `globals.css` and `StatusBadge`
  references them **zero** times. One definition must win.
- **`text/muted` contrast** — `--muted-foreground: oklch(0.556 0 0)` measures **4.34:1** on the
  neutral surfaces used by table headers and hovered rows.
- **Brand absent** — `--primary: oklch(0.205 0 0)`, chroma **zero**. The admin product has no brand hue.
- **Typography tokens** — `globals.css` contains **zero** `--font-size` / `--line-height` /
  `--font-weight` variables. The system ships 14 styles bound to 25 typography variables.
- **Control heights** — Input and Select are `h-9` (36px) everywhere; Button tops out at 36 (`lg` is
  40). The system adds a 44px touch size.
- **Button size taxonomy** — production defines `default, xs, sm, lg, icon, icon-*`; the product only
  uses `sm`, `default` and `icon`.
- **Radius** — production defines only `--radius-sm/md/lg/xl`; the system adds `none`, `2xl` (public
  catalog) and `full` (badges, pills).
- **Chart colours** — ~~`TrendChart` and `ProgressRing` hardcode emerald~~ **CLOSED in Wave 6**:
  both consume `data/paid`, and no hardcoded chart palette remains (§10.20).
- **Data role classes** — ~~three class families per role in `dashboard/tones.ts`~~ **CLOSED in
  Wave 6**, but into **two** custom properties per meaning, not one: `data/<meaning>` for fills and
  strokes, `data/<meaning>/foreground` for text. The graphical values fail WCAG 1.4.3 as normal text
  (§10.20).
- **`data/partial` — three hues for one role** *(`VISUAL BEHAVIOR CHANGE · PRODUCT DATA
  RECONCILIATION`)* — **corrected 2026-09-06 at HEAD `124445b`.** The earlier entry said the amber
  contradiction "was already fixed in Phase 10, so the remaining difference is a hue, not a family."
  That is true **only of `tones.ts`**. Production paints the same `partial` / **Abonada** role three
  different ways:

  | Consumer | Hue | Surface |
  |---|---|---|
  | `src/features/dashboard/tones.ts:26` | `blue-600` / `blue-400` | Seller dashboard donut, figures, bars |
  | `src/components/data/PaymentProgressBar.tsx:25` | **`amber-500` / `amber-400`** | All four ticket lists (table + phone cards) |
  | `src/features/tickets/components/ClientTicketCardList.tsx:171` | **`amber-600` / `amber-400`** | Client's ticket cards |
  | `src/components/data/StatusBadge.tsx:37` | **`amber-100/900` family** | The «Abonada» badge, everywhere |

  The system resolves `data/partial` to `sky/600` (#0084D1), `sky/400` in Dark — a fourth value.
  `PaymentProgressBar` does **not** import `tones.ts`; it duplicates the palette inline, and its own
  comment cites D-112 for *ámbar* while `tones.ts` cites D-112 for *azul*.

  Because the token contract collapses this to **one** custom property per role, choosing it is not a
  hue nudge: it repaints either the dashboard or the four highest-traffic ticket lists plus the badge.
  Note also that `StatusBadge` already uses **sky** for `available` / *Disponible*, so `data/partial =
  sky` would put «Abonada» and «Disponible» on the same hue.

  **The data wave must decide `data/partial` vs `status/warning` vs the Status label «Abonada»
  explicitly, so Product Data semantics and Status semantics do not become accidentally coupled.**
  `data/pending` is `neutral/400` in Light where production uses `muted-foreground`.

  **Not a Wave 1 item.** Wave 1 ships `data/partial` at the approved Figma value with **zero**
  consumers and migrates none of the four above.
- **Catalog destructive** *(theme-specific)* — `.catalog-theme --destructive: oklch(0.65 0.2 25)`
  measures **3.45:1** with the near-white label.
- **Catalog input border** *(theme-specific)* — `.catalog-theme --input: oklch(0.75 0.06 295 / 30%)`
  measures **1.75:1**; an input is identified by its border.
- **Collapsed nav target** *(accessibility)* — the collapsed sidebar item is 40px (56 rail, 8px
  padding), below the 44 standard. One padding value.
- **Legacy token consumers** — legacy variables stay until their consumers are migrated. Removing
  them early is explicitly forbidden (§13).

### C. FIGMA-ONLY CONSTRAINT (never a code blocker, never an API)

- `Cell / Status` and `Cell / Selection` are variant sets only because nested-instance overrides do
  not propagate two levels deep. In code a status cell is a cell that renders `StatusBadge`.
- The focus ring is a real frame (offset fill + 2px outside stroke) because drop shadows do not
  render over solid fills on instance roots. In code: `outline` + `outline-offset`.
- Every component has an inner `Surface` frame because effects do not paint on instance roots. Code
  must not inherit a mandatory wrapper element from it.
- The "Touch target" variant exists because Figma has no pointer media query. It must not become a
  required prop.
- `Progress / Linear` exists at fixed steps; code takes a continuous value.
- Sample content (row, menu and legend counts) is fixed for legibility and is **not** configuration.
- Breakpoint frames and specimen widths are photographs, not rules.
- Icon geometry is absolute `M/L/C/Z` paths because the Plugin API rejects arc commands. Code keeps
  importing `lucide-react`; the paths are a rendering of the same source, not a second icon library.

### D. MANUAL HOUSEKEEPING

- No outstanding item recorded. Any community-library removal noted in earlier sessions has no
  remaining entry in the readiness matrix or the reconciliation card — verify in Figma before
  assuming work exists here.

### E. NEW — DISCOVERED DURING WAVE 1 (2026-09-06)

Four findings, none of which blocked Wave 1. The first three are **new debt for Wave 2**; the fourth
is a correction to how this track measures success.

- **Four contract token names collide with live Tailwind v4.3.3 namespaces**
  *(`TOKEN · CROSS-SYSTEM`)* — `--spacing-*`, `--radius-*`, `--breakpoint-*` and `--font-weight-*` are
  all real theme namespaces in the installed Tailwind. Routing the contract names through `@theme`
  would change rendered output (`--spacing-100` turns the `100` padding utility from 25rem into 4px; `--breakpoint-*`
  redefines every responsive variant). Wave 1 shipped them as `--ds-*` only. **Wave 2 must decide
  each one deliberately** — the token contract on `04 — Design to Code` assumed these names were free
  and they are not.

- **`radius/none`, `radius/2xl` and `radius/full` are not actually additions**
  *(`TOKEN · LOCAL`)* — the contract calls them "additions", but Tailwind already ships
  `rounded-none`, `rounded-2xl` (1rem = 16px, matching Figma) and `rounded-full`. Declaring them
  would *shadow* working utilities, not add anything. `--radius-sm/md/lg/xl` already exist in
  `globals.css` and already match Figma exactly (6·8·10·14). The real remaining radius work is
  smaller than the contract implies.

- **`.catalog-theme` never defined `--success` / `--warning`** *(`TOKEN · THEME (Catalog)`)* — the
  legacy block at `globals.css:374` redefines 20 properties but not those four
  (`--success`, `--success-foreground`, `--warning`, `--warning-foreground`), so in the public catalog
  they silently fall back to the **Light** values. Nothing consumes them today (`StatusBadge` ignores
  them — see §7B), so it is latent, not live. The new `--ds-status-*` layer is complete in all three
  scopes, so migrating `StatusBadge` onto it in Wave 4 closes this by construction.

- **Prose inside a scanned file emits real CSS** *(method, not debt — but it bites)* — Tailwind v4
  scans the whole project for class-name candidates, **including `.md` files and the comments inside
  `globals.css` itself**. Documenting this wave put utility names into prose, and the build silently
  gained 24 lines of dead CSS for classes nothing renders; a bare `--color-…` name written in a CSS
  comment likewise made Tailwind emit that theme variable. Both were caught by diffing the compiled
  output and were removed by rewording — the delta is now **exactly the new tokens and nothing else**.
  **Rule for future waves: write token names in Figma path form (`surface/card`), not utility form,
  and diff the compiled CSS rather than trusting the source diff.**

- **Tailwind v4 tree-shakes unused `@theme` variables** *(method, not debt)* — the first Wave 1
  compile emitted every `--ds-*` and **not one** `--color-*`, because nothing consumes them. A wave
  that ships tokens with zero consumers by design must use `@theme static`, or its entire deliverable
  is silently dropped from the build. Any future wave that adds tokens ahead of their consumers needs
  the same treatment, and **must verify emission rather than assume it**.

### F. THE FOUR TAILWIND COLLISIONS — RESOLVED IN WAVE 2

Recorded in Figma at `04 — Design to Code` › Token contract (five appended rows). **None is a real
contract conflict**: in every case the framework already expresses the approved value, or the value
is consumed by CSS that already exists. Figma variables were **not** renamed, and **no working
Tailwind built-in was shadowed**.

| # | Contract name | Strategy | Resolution |
|---|---|---|---|
| 1 | `--spacing-*` | **A — use the existing Tailwind equivalent** | The Figma step is the Tailwind step **× 100**, so all 14 map exactly: `spacing/400` (16px) **is** `p-4`, `spacing/200` is `p-2`, `spacing/1600` is the 16 step. Not exposed to `@theme`, because declaring `--spacing-100` would turn the `100` padding utility from 25rem into 4px. `--ds-spacing-*` remains for hand-written CSS. |
| 2 | `--radius-*` | **A — use the existing Tailwind equivalent** | `sm\|md\|lg\|xl` already exist in `globals.css` and already match Figma (6·8·10·14). `none` = `rounded-none`; `2xl` = `rounded-2xl` (1rem = 16px, the Figma value); `full` = `rounded-full` — Figma resolves it to 999px and Tailwind to `calc(infinity * 1px)`, which render identically at every real control size. **The earlier note calling `none`, `2xl` and `full` "additions" was wrong** and is corrected in Figma. |
| 3 | `--breakpoint-*` | **B — keep internal, do not expose** | The most expensive of the four: declaring `--breakpoint-md` would redefine every `md:` / `lg:` variant in the app. `breakpoint/md` (768) is already Tailwind's `md`, a plain equivalence. `mobile-min` (320) is a supported-width floor, not a breakpoint. `sidebar-compact` (1360) and `sidebar-max` (1600) are not Tailwind breakpoints and are already implemented as hand-written media queries (85rem / 100rem). |
| 4 | `--font-weight-*` | **A — use the existing Tailwind equivalent** | Values identical: medium 500, semibold 600, bold 700. Figma's `weight/regular` is Tailwind's `font-normal` (400) — same value, different name, and the Figma variable is **not** renamed to match. The roles consume `--ds-font-weight-*` internally via `--text-<role>--font-weight`, so a screen still asks for a role and never for a number. |

**Remaining Wave 2 debt — the route-level sweep.** Wave 2 migrated dependency **layer 2** (shared
components). `src/features/` and `src/app/` still hold **≈108 files and ~470 ad-hoc text utilities**;
route-level composition is **layer 8** in the dependency graph, so it belongs with Patterns / Screens
(Wave 7), not here.

**Two role gaps found while migrating — both DECIDED, neither is a missing role** (§5, Wave 2
decisions): 16–18px at weight 600 ships as `Body/Large` + explicit `font-semibold` (local emphasis),
and the 30px/700 collection figure stays with the Product Component migration.

**Corrected production fact — `tabular-nums`.** The Typography contract on `04 — Design to Code`
said *"Production already applies it in 10 files"*. Re-measured 2026-09-06 at HEAD `3aae867`:
**58 files, 154 occurrences**. Production was already far more systematic than the contract assumed,
so the remaining work is an audit of gaps, not a rollout. Corrected in Figma. It stays a **code
typography behaviour applied where numeric alignment requires it** — it is never turned into a
size/style token.

---

## 8. Phase 11 contract summary — `04 — Design to Code`

16 sections, 312 text nodes, all token-bound. Contents:

1. **Verified reconciliation backlog** — the 15 items in §7B, each re-checked against shipped code on
   2026-09-06 and tagged `TOKEN | COMPONENT | VISUAL | ACCESSIBILITY | FIGMA-ONLY` plus an impact class.
2. **Token contract** — the naming rule, and what each family exports.
3. **Typography contract** — net-new; roles not raw sizes; tabular figures recorded as a code
   requirement Figma cannot express.
4. **Component contract** — 11 families, each split **PUBLIC API / IMPLEMENTATION DETAIL /
   ACCESSIBILITY METADATA / FIGMA-ONLY WORKAROUND**.
5. **Dependency graph** — 8 layers, from token infrastructure to route composition.
6. **Implementation waves** — 7 waves (see §9).
7. **Change impact classification** — LOCAL · FAMILY · CROSS-SYSTEM · THEME-SPECIFIC · ROLE-SPECIFIC.
8. **Visual regression contract** — 12 chosen checkpoints plus an explicit "not captured" list. The
   only pair is **1359 and 1360**, because the behaviour inverts across one pixel.
9. **Accessibility implementation contract** — 9 clauses separating Figma metadata from code behaviour.
10. **Theme migration** — Light / Dark / Catalog as modes; all three scopes updated together.
11. **Brand migration impact** — the near-black to green flip, its blast radius, and its reversibility.
12. **Product Component vs Design System boundary.**
13. **Figma constraints that must NOT leak into code.**
14. **Code Connect readiness** — **deferred on purpose**. No `.figma.ts` exists and none should be
    written until after Wave 5. First four to map then: Button, Badge / Status, Input, table cells.
15. **Recommended first production pilot.**
16. Header and status block.

### Approved pilot: **Clientes — Seller portal**

Why: it exercises the **List** pattern (search, pagination), the **768 table to card-list
transformation**, the **Detail** page (page header, `titleBadge`, `compactAction`, related tickets), a
real **Form** with validation and error states, both empty states and `StatusBadge` in two states —
six of eight dependency layers across three routes. Its only destructive action is **archiving, which
is reversible**, so operational risk is far lower than Boletas (bulk selection, import, release and
client-change dialogs, clearance switch) or Pagos (money, allocation arithmetic, voiding). Piloting in
the **Seller** portal puts the 375 card list and the 44px touch floor under real use, because sellers
work from phones.

**Do NOT implement the pilot.** It belongs to Wave 7 / a later authorized phase.

---

## 9. Migration waves

Exactly as approved in `04 — Design to Code` › Section · Implementation waves.

| # | Name | Purpose | Prerequisites | Risk |
|---|---|---|---|---|
| **1** | Tokens | Add semantic custom properties **beside** the existing ones in all three scopes; nothing consumes them yet, so nothing can regress. | none | **LOW** |
| **2** | Typography | Introduce type variables and the semantic roles; migrate components off ad-hoc utilities. | Wave 1 | **MEDIUM** |
| **3** | Core controls + **BRAND** | Button, Input, Select, Checkbox, Switch, Badge adopt tokens and touch sizes; `action/primary` stops being near-black and becomes brand green. | Waves 1–2 | **HIGH** |
| **4** | Data display & overlays | Cells, pagination, empty, skeleton, Dialog, Sheet, Menu, Tooltip, plus the two Catalog contrast fixes. | Wave 3 | **MEDIUM** |
| **5** | Navigation & shell | Sidebar states, collapsed target 40 → 44, selected treatment gains the brand indicator. | Waves 3–4 (scrim tokens from Wave 1) | **MEDIUM** |
| **6** | Data visualisation | Chart and Metric colours move onto the `data/*` roles. Independent of 3–5, so it can run in parallel. | Waves 1–2 | **LOW** |
| **7** | Patterns & pilot screen | Compose the migrated pieces on one real screen (Clientes, Seller). This is where integration problems surface. | Waves 3, 4, 5 | **MEDIUM** |

Risk is relative and argued, **not** an hour estimate.

> **CURRENT POSITION: every wave and every rollout through R6A is approved and committed. R6B is
> executed and uncommitted, awaiting review.**
> **Wave 3 was SPLIT (approved 2026-09-06): 3A core-control adoption, 3B brand activation.** This is
> an EXECUTION split only — the dependency model is unchanged, no new architectural layer exists.
> 3B was split again into 3B1 (semantic convergence), 3B1b (activation prerequisites) and 3B2 (the
> flip itself), which shipped the brand.
> **Waves 4.5A and 4.5B were INSERTED (approved 2026-09-06)** to audit and then migrate product
> Status semantics — a surface the original seven-wave plan never assigned to any wave.
> **Wave 6 is COMPLETE (2026-09-06).** `data/partial` is the approved sky family, the three-way
> `partial` split recorded in §7B is resolved for **both** graphics and text, and the token contract
> gained four evidence-backed `data/*/foreground` roles because the graphical roles are not text-safe
> (§10.20).
> **Waves 6.5A, 6.5B and 6.6 were INSERTED** to close the Notice component gap and then the three
> cross-system prerequisites the Wave 7 preflight found: muted-text contrast, input borders and touch
> control sizing. The original seven-wave architecture is unchanged.
> **ALL SEVEN ORIGINAL WAVES ARE COMPLETE AND APPROVED**, together with the inserted reconciliation
> waves 3A/3B·4.5·6.5·6.6. The **Clientes Seller pilot succeeded** (§10.25) with zero Core defects.
> **ROLLOUTS R1, R2 and R3 are COMPLETE AND APPROVED** (§10.27, §10.28, §10.29), and
> **`Pattern / Focused System State` is FORMALIZED** (§10.30), proven by `/denied` and `/offline`.
> **ROLLOUTS R1–R5 are COMPLETE AND APPROVED** (§10.27–§10.34), and `Pattern / Report Page` is
> **PROVEN**. **R6A — PEOPLE PREREQUISITE AUDIT is COMPLETE AND APPROVED** (§10.35).
> **R6B — PEOPLE DESIGN SYSTEM PREREQUISITE RECONCILIATION is EXECUTED and uncommitted** (§10.36):
> Notice gained `density`, one generic linear progress component completed the partial contract on
> the roles that had been unused since Wave 1, and `SellerKpis` moved from Product Data to business
> completion progress. **Both People prerequisites are CLOSED.**
> **The refreshed People preflight (§10.37) returns READY FOR EXECUTION**, with one correction it
> makes itself: **no People route reaches any Progress consumer** (§10.37).
> **R6D — DROPDOWN MENU TOUCH RECONCILIATION is COMPLETE AND APPROVED** (§10.38): the People gate
> measured the shared menu item's real hit box at 32 px with nothing larger behind it, so the
> primitive gained a 44 px floor on phones that is **released above the small breakpoint** — desktop
> density is unchanged. It is a **People prerequisite**, checkpointed separately from the route work.
> **R6C — PEOPLE is COMPLETE** (§10.39): five routes, seven production files, **zero Core changes and
> an empty selector diff**. Its two gates found and fixed a real defect each — the shared menu's touch
> target, which became R6D, and **five detail-page section titles that were missing from the document
> outline**, corrected across People *and* the previously approved raffle detail.
> **No People route reaches any Progress consumer**, and `Search / Filters` was **not** promoted.
> **R7A — PUBLIC CATALOG THEME & PATTERN AUDIT is COMPLETE** (§10.40), audit only and uncommitted.
> It corrects the inventory: Catalog palette is **not** zero — the earlier count scanned for named
> colour scales and this page uses raw white and black alphas — and the tokens that would replace
> them **already exist with zero consumers**, exactly like the progress roles before R6B. It returns
> **no new Pattern**, four contract decisions and one shared-component prerequisite.
> **R7-PRE — SEARCH INPUT TOUCH RECONCILIATION is COMPLETE** (§10.41): the shared search field's
> ad-hoc touch boolean is replaced by the `size` contract the rest of the system already uses, and
> the ramp moves from the medium breakpoint to the small one.
> **R7B — PUBLIC CATALOG is COMPLETE AND APPROVED** (§10.42), and it is the **first rollout
> validated on the real route with live data**. Eight glass and gradient roles that had no consumer
> now have one, the catalogue's raw colour count is **zero**, availability moved to the Success
> family, and the summary bar is classified as **business completion progress** — with its adoption
> returned as a contract decision. **Dashboards are refreshed in §10.43.**
> **R8A — DASHBOARD PATTERN & SEMANTIC AUDIT is COMPLETE** (§10.44), audit only and uncommitted. It
> finds the gap **smaller than feared**: 12 of the 15 palette occurrences are adoption debt against
> families that already exist, there is **no component gap**, and Product Data is already fully
> adopted. It returns **one Pattern candidate**, **one possible new semantic family** — how a numeric
> coincidence with a published lottery number may be presented, which BR-L15 constrains — and **two
> product decisions**.
> **CLOSURE MODE is in force** (§10.45): only a closure blocker stops a rollout.
> **`Pattern / Dashboard Page` is FORMALIZED** (§10.47), and the **Responsive Collection Presentation**
> guideline is approved (§10.46) — responsive cards as the mobile default, scroll that belongs to the
> table and never to the page, and the table-action rule settled. **R8 — DASHBOARD is authorized.**

---

## 10. Phase 12 status — WAVE 1 EXECUTED

**PHASE 12 IS COMPLETE. Wave 1 is on disk, uncommitted, awaiting user review.**

### 10.1 What shipped

One file changed: **`src/app/globals.css`**, +647 lines, 0 deletions. Appended as one contiguous,
revertible section at the end of the file; **no existing line was edited**.

| Piece | Count | Where |
|---|---|---|
| `--ds-*` raw colour tokens | 85 × 3 scopes = **255** | `:root`, `.dark`, `.catalog-theme` |
| `--ds-*` scalar tokens | **67** | `:root` only (single-mode in Figma) |
| Brand pin re-declarations | **3** | one per scope |
| `--color-*` contract exports | **85** | `@theme static inline` |
| Typography exports (`--font-size/-line-height/-letter-spacing`) | **20** | `@theme static inline` |
| Sizing exports (`--size-*`) | **16** | `@theme static inline` |
| **Contract names exported in total** | **121** | |

Values were **generated from the Figma variables**, not hand-typed: each token was resolved per mode,
aliases to other semantic tokens emitted as `var(--ds-…)` (preserving the chain), aliases to
primitives emitted as literals. **Primitives are not exported**, per the contract.

### 10.2 The two-tier shape, and why it exists

`@theme inline { --color-x: var(--color-x) }` is circular, so the value cannot live under the same
name it exports. The raw value lives in `--ds-<path>` (declared per scope) and the contract name
`--color-<path>` is declared in `@theme`, exactly mirroring the pattern the file already used with
`--background` and its `@theme` export. Utilities compile to `var(--ds-…)`, so they re-skin across
Light / Dark / Catalog with no component branching — verified by probe (§10.4).

### 10.3 The brand pin

`action/primary` aliases `brand/default` in Figma. Wave 1 declares that real wiring, then a clearly
fenced block re-declares `--ds-action-primary: var(--primary)` in all three scopes — same
specificity, later source order, so it wins. Verified resolved values: `oklch(0.205 0 0)` in `:root`,
`oklch(0.922 0 0)` in `.dark`, `oklch(0.55 0.245 296)` in `.catalog-theme` — **today's values,
unchanged**.

**Wave 3 = delete that one block.** To revert, put it back. `-hover` and `-active` are deliberately
*not* pinned: production has no hover/active primary token to preserve (buttons darken with
an opacity modifier on `primary`), so there is no "today's value" to hold, and nothing consumes them.

### 10.4 Validation

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ pass (inside `verify`) |
| `npm run lint` | ✅ pass (inside `verify`) |
| `npm run test` | ✅ **47 files, 791 tests passed** |
| `npm run build` | ✅ pass — all 33 routes built |
| `npx prettier --check src/app/globals.css` | ✅ pass |
| **Compiled-CSS diff (the real proof)** | ✅ **0 removed lines**, 460 added — every one a new token, scope opener or brace |
| Brand pin resolves to today's value ×3 scopes | ✅ verified in compiled output |
| Utilities generate and resolve via `var(--ds-*)` | ✅ probed via a temporary `@source inline(...)` against the `surface/card`, `status/error/text`, `border/input`, `data/partial` and `text/muted` tokens, then reverted |
| `npm run test:db` | ⛔ **NOT RUN** — see below |

The compiled-CSS diff is the load-bearing evidence: a *modified* declaration would appear as both a
removed and an added line. **Zero lines were removed**, so nothing that existed before changed. Method:
compile `globals.css` through the project's own `@tailwindcss/postcss` before and after, then diff.

**`npm run test:db` was NOT run.** It needs Docker + a local Supabase (`vitest.db.config.mts` says so
in its header) and the Docker daemon is not running on this machine. It was **not** skipped for
convenience and it is **not** reported as passing. Running it would also require `npm run db:reset`,
which **wipes the local development database** — not something to do unprompted. Wave 1 changed one
CSS file: no migration, no schema, no query, no server code, so the database suite has nothing in
this diff to exercise. **Offer stands to run it once Docker is up.**

### 10.5 Original intent, for the record

Intent, from the approved Phase 11 contract:

- Purely **additive** infrastructure.
- Semantic custom properties added to **all three scopes together** — `:root`, `.dark`, `.catalog-theme`.
- Exposed through `@theme inline`.
- Typography infrastructure (size / line-height / weight / letter-spacing variables).
- Product-data semantic infrastructure (the `data/*` roles).
- **Legacy variables retained.** Nothing is removed.
- **No broad component adoption** — components still consume what they consume today.
- **No brand visual activation.** `action/primary` ships resolving to the **current** near-black
  value; the flip to green happens in Wave 3, which is what keeps it reversible by one alias.
- **Visual appearance should remain effectively unchanged.**

**No persistent Phase 12 execution prompt exists in the repository.** The user issues each phase
prompt in chat; if a Phase 12 prompt is provided, it governs. Otherwise this checklist — derived from
the approved Phase 11 contract, **not invented here** — is the scope:

1. Read the token contract and theme migration sections on `04 — Design to Code`.
2. Read `src/app/globals.css` in full and record the current values before changing anything.
3. Add semantic properties for: brand, surfaces and text, border and focus, action, status,
   navigation / progress / selection, overlay, product data, spacing and radius, sizing, elevation —
   following `--color-<path>` (lowercase, `/` becomes `-`), with primitives **not** exported.
4. Add typography variables (`--font-size-*`, `--line-height-*`, `--font-weight-*`, `--letter-spacing-*`).
5. Mirror every property into `.dark` and `.catalog-theme`. A scope left behind falls back silently.
6. Expose the new properties through `@theme inline`.
7. `action/primary` must resolve to today's value. **Do not flip the brand.**
8. Do not touch any component. Do not remove any legacy variable.
9. Verify: `npm run verify` and `npm run test:db` green, and diff computed values on a few nodes to
   prove the appearance did not change.
10. Report, update this file (§16), and stop.

All ten were executed, with **three documented deviations** — each made to protect the "zero visual
change" guarantee, none of them a scope change:

| # | Checklist said | What shipped | Why |
|---|---|---|---|
| 5 | "Mirror **every** property into `.dark` and `.catalog-theme`." | Colours mirrored into all three scopes. **Scalars declared once in `:root`.** | The stated reason for mirroring is that "a scope left behind falls back silently" — that risk only exists for values that *vary by mode*. Spacing, radius, sizing, breakpoints and typography have **one** mode in Figma, so there is no Dark or Catalog value to leave behind. Mirroring them would be duplication with no meaning. |
| 6 | "Expose the new properties through `@theme inline`." | Colours, typography and sizing exposed (121 names). **`--spacing-*`, `--radius-*`, `--breakpoint-*` and `--font-weight-*` deliberately NOT exposed** — they ship as `--ds-*` only. | Measured against the installed **tailwindcss 4.3.3**: all four are live theme namespaces. `--spacing-100` would turn the `100` padding utility from 25rem into 4px; `--breakpoint-*` would redefine every `md:` / `lg:` variant in the app; `--radius-sm/md/lg/xl` already exist and already match Figma (6·8·10·14), while `none`/`2xl`/`full` are already served by Tailwind and declaring them would shadow those utilities; `--font-weight-*` already exists with identical values. Exposing any of them could change rendered output, which Wave 1 forbids. **Wave 2 should decide these deliberately.** |
| 6 | `@theme inline` | `@theme **static** inline` | Tailwind v4 emits only the theme variables something *uses*, and Wave 1 has **zero consumers by design**. Without `static`, all 121 contract names were tree-shaken out of the compiled CSS — verified: the first compile emitted `--ds-*` and **not one** `--color-*`. The infrastructure would have been invisible and `var(--color-surface-card)` would resolve to nothing. `static` forces emission; since nothing consumes them, they still paint nothing. |

---

### 10.6 WAVE 2 — TYPOGRAPHY (executed 2026-09-06 · **APPROVED** · committed, hash in §11)

**Approved scope, verified identical in Figma (`04` › Implementation waves + Dependency graph) and
§9 of this file:** *"Introduce type variables and the semantic roles; migrate components off ad-hoc
utilities."* Prerequisite Wave 1. Risk MEDIUM. Dependency layer 2: *"Depends on wave 1 only. Touches
every screen visually but no logic."*

**What shipped — 19 files.**

| Piece | Detail |
|---|---|
| The 14 roles | `src/app/globals.css` **+114 / −0**. Each Figma text style becomes a `--text-<role>` key with its `--line-height`, `--font-weight` and `--letter-spacing`, bound to the Wave 1 `--ds-*` tokens. Generates one utility per role: `Display/Hero`, `Heading/H1`–`H4`, `Body/Large`–`Small`, `Label/Medium`–`Small`, `Caption/Regular` and `Metric/Large`–`X-Large` |
| Component migration | **38 class swaps in 18 shared components** — `data/`, `feedback/`, `form/`, `layout/` and the non-control `ui/` primitives. 38 insertions, 38 deletions, **no logic touched**. |

**Why the roles are safe to sit next to existing utilities.** Tailwind compiles a role to
`font-size: …; line-height: var(--tw-leading, …); letter-spacing: var(--tw-tracking, …);
font-weight: var(--tw-font-weight, …)`. An explicit `leading-none`, `tracking-tight` or
`font-semibold` on the same element sets that `--tw-*` variable and therefore **still wins,
regardless of class order**. That is what let `ui/label.tsx` keep `leading-none`, `PageHeader` keep
`tracking-tight` and `ui/dialog.tsx` keep `font-semibold` while adopting a role.

**Visual result: no intended visual change.** Every migrated pair was proved numerically equal from
the compiled CSS:

| Was | Computed | Became | Computed |
|---|---|---|---|
| `text-xs` | 12px / 16px | `text-caption-regular` | 12px / 16px |
| `text-sm` | 14px / 20px | `text-body-small` | 14px / 20px |
| `text-sm font-medium` | 14px / 20px / 500 | `text-label-medium` | 14px / 20px / 500 |
| `text-base` (in `CardTitle`) | 16px / 24px / 600 | `text-heading-h4` | 16px / 24px / 600 |
| `text-lg` | 18px / 28px | `text-body-large` | 18px / 28px |
| `text-2xl font-semibold` | 24px / 32px / 600 | `text-heading-h2` | 24px / 32px / 600 |

**The one real computed-value delta:** migrated elements go from inheriting `letter-spacing: normal`
to an explicit `0px`. Geist's normal spacing is 0, so rendering is unchanged — but it is a genuine
computed difference and the one thing the diff cannot call byte-identical. It is deliberate: a role
that does not pin its own tracking is not a complete role.

**Deliberately NOT migrated, and why** — each would have changed rendering or belongs to another wave:

| Left alone | Reason |
|---|---|
| `ui/button.tsx`, `badge.tsx`, `input.tsx`, `select.tsx`, `textarea.tsx`, `tabs.tsx` | Wave 3's core-control family, and each carries size-variant or responsive text overrides (`text-base md:text-sm`) where two role utilities on one element would race on cascade order. |
| `ui/avatar.tsx`, `ui/dropdown-menu.tsx` | Same hazard, via a size-scoped `group-data` text override. |
| `data/TrendChart.tsx` | `text-[0.625rem] sm:text-xs` — an arbitrary value with a responsive override, and Wave 6's family. |
| `CollectionSummaryCard` hero figure | `text-3xl font-bold sm:text-4xl`. **No role matches 30px/700**, and Display/Large would change the line-height 40 → 44. |
| Everything in `src/features/` and `src/app/` | Route-level composition is dependency **layer 8**, not layer 2. 108 further files, ~470 occurrences — see §7F debt. |

### 10.7 Wave 2 validation

Baseline = the Wave 1 commit `3aae867`, whose tree is byte-identical to the state that passed
`npm run verify` before committing.

| Check | Before (Wave 1 `3aae867`) | After (Wave 2) |
|---|---|---|
| `npm run typecheck` | ✅ | ✅ |
| `npm run lint` | ✅ 0 errors, 2 pre-existing warnings | ✅ 0 errors, **same** 2 warnings |
| `npm run test` | ✅ 47 files / 791 tests | ✅ 47 files / **791 tests** |
| `npm run build` | ✅ | ✅ compiled successfully |
| `npx prettier --check` | ✅ | ✅ (re-sorted by `prettier-plugin-tailwindcss`) |
| `npm run test:db` | ⛔ NOT RUN | ⛔ **NOT RUN** — still no Docker, and Wave 2 is CSS + class names only |

The 2 lint warnings are `react-hooks/incompatible-library` on `useVirtualizer`, in files no wave has
touched.

### 10.8 WAVE 3A — CORE CONTROLS ADOPTION (executed 2026-09-06 · **APPROVED** · committed, hash in §11)

Wave 3 was **split by approval**: **3A** adopts the semantic architecture in the Core controls;
**3B** performs the visible brand activation and is **NOT AUTHORIZED**. This is an **execution split
only** — the dependency model is unchanged and no new architectural layer exists.

**Method: adopt only what is provably identical.** Every legacy value and its semantic counterpart
were resolved to sRGB hex in all three scopes and compared. Only tokens that matched **exactly in all
three** were adopted, so the wave carries **no intended visual change**.

| Adopted (identical in Light · Dark · Catalog) | Replaced |
|---|---|
| `action/primary` | `primary` — safe **because of the Wave 1 pin** |
| `action/secondary`, `text/on-secondary` | `--secondary`, `--secondary-foreground` |
| `background/default` | `background` |
| `surface/accent`, `text/on-accent` | `--accent`, `--accent-foreground` |
| `surface/popover`, `text/on-popover` | `--popover`, `--popover-foreground` |

**7 files, 24 replacements:** `button`, `badge`, `input`, `textarea`, `select`, `checkbox`, `switch`.

**Deliberately NOT adopted** — each measured, each would have changed pixels:

| Token | Measured difference | Class |
|---|---|---|
| `focus/ring` | Light `#a1a1a1` → **`#0d7d2d` brand green**; Dark `#737373` → `#7bef92`. It aliases `brand/default`, which the pin does **not** cover. | **Would be the brand flip** — refused per the standing rule |
| `border/input` | Light `#e5e5e5` → `#949494`; Dark `#ffffff26` → `#666666` | C · component-contract reconciliation, deferred |
| `text/muted` | Light `#737373` → `#525252` | B · the known 4.34:1 accessibility fix, CROSS-SYSTEM |
| `text/on-primary` | Light `#fafafa` → `#ffffff`; Dark `#171717` → `#0a0a0a` | C, deferred with the brand |
| `action/destructive` | Catalog `#f14d4c` → `#d92d2c` | B · the approved Catalog contrast fix — **Wave 4** |
| `text/on-destructive` | Dark `#fafafa` → `#0a0a0a` | C, deferred |
| `selection/surface`, `control/track-off` | brand-derived / differ | deferred |

**The pin covers only `action/primary`.** Every other brand-derived role — `focus/ring`,
`navigation/*`, `progress/value`, `selection/surface`, `text/brand`, `border/brand` — still resolves
to live brand green. That is why focus could not be migrated in 3A: **adopting `focus/ring` today
*is* the brand flip.** The pin block was not altered.

**Size and touch.** Production already implements the touch target — as **39 ad-hoc
`h-11 … sm:h-9` overrides across 24 files**. Wave 3A adds the missing API instead of enlarging
anything: two new Button sizes, `touch` (44px, dropping to 36px from `sm`) and `icon-touch`
(44×44 → 36×36). **No default changed and no existing call site was touched**, so the wave is
visually inert; the 39 overrides are recorded as the debt this API exists to retire.

**Typography completion (deferred from Wave 2).** The control families Wave 2 skipped for cascade
safety now use roles: Button → `Label/Medium`, Badge → `Label/Small`, Input and Textarea →
`Body/Medium` with `Body/Small` from `md`, Select trigger and items → `Body/Small`, Select label →
`Caption/Regular`. The dead `xs` / `icon-xs` / `icon-lg` Button sizes were left untouched — they have
**zero usage** in the product, so their internal text utilities cannot render.

### 10.9 Wave 3A validation and blast radius

| Check | Before (`b33003e`) | After (Wave 3A) |
|---|---|---|
| typecheck · lint · tests · build | ✅ · ✅ 0 errors / 2 warnings · ✅ 791 · ✅ | ✅ · ✅ **same** 2 warnings · ✅ **791** · ✅ |
| prettier | ✅ | ✅ (only the pre-existing `nav-items.ts` warning, present at the branch point) |
| Brand-leak check | — | ✅ **no compiled utility resolves to `brand/*` or `focus/ring`** |
| `npm run test:db` | ⛔ NOT RUN | ⛔ NOT RUN — no data or database behaviour touched |

**Post-3A brand-pin blast radius, measured in code (not inferred from Figma).** Removing the pin
today would change **8 occurrences in 4 files**: Button default + hover, Badge default + hover,
Checkbox checked border/background (and its Dark override), Switch checked track.

**Two findings that change the Wave 3B plan:**

1. **Catalog would not move at all.** Its `brand/default` (`#843bec`) already equals its `--primary`,
   so the flip is a **Light and Dark** event only.
2. **23 files still read the legacy `*-primary`** (4 of them Catalog-only, so inert). They would
   **not** flip, leaving the product two-toned: green Buttons and Badges beside a near-black selected
   report tab (`ReportNav`), selected sidebar item (`NavLinks`), notification dot, selected cards in
   `CommissionModelField` and `ImportDropzone`, the tour ring, and three dashboard accents.
   **So Wave 3B is not "delete one block".** It is: delete the block **and** migrate those consumers
   in the same wave, or ship an inconsistent product.

### 10.10 WAVE 3B1 — BRAND SEMANTIC CONVERGENCE (executed 2026-09-06 · **APPROVED** · committed, hash in §11)

Wave 3B was split again, by approval: **3B1** converges consumers onto the correct brand-derived
semantic roles with **zero intentional visual change**; **3B2** performs the visible activation and
is **NOT AUTHORIZED**.

**Rule applied throughout: a legacy CSS name is not evidence of semantic meaning.** Every consumer
was classified by its **UI responsibility**, not by the fact that it happened to consume `--primary`.

#### The legacy-primary consumer audit (21 non-Catalog occurrences)

| Consumer | UI purpose | Correct role | Inert? | Outcome |
|---|---|---|---|---|
| Button link variant · Badge link variant · 3 dashboard "ver todo" links | brand-coloured **text link** | `text/brand` | ✅ pin to `--primary` | **MIGRATED** |
| All 7 controls' focus ring + border | **keyboard focus** | `focus/ring` | ✅ pin to `--ring` | **MIGRATED** |
| `NavLinks` selected item · `ReportNav` selected tab | **navigation selection** | `navigation/selected` | ❌ | **DEFERRED — design decision** |
| `OptionList` selected option · `CommissionModelField` selected card · `ImportDropzone` drag-active | **selection** | `selection/surface` | ❌ | **DEFERRED — design decision** |
| `CollectionSummaryCard` bar ("Porcentaje recaudado") · `CommissionCard` bar ("boletas cobradas") | **collection / money progress** | `progress/value` **or** `data/*` | ❌ | **DEFERRED — touches the unresolved `data/partial` decision** |
| `BulkTicketCreator` bar ("Progreso del guardado") | **task progress** — unambiguous | `progress/value` | partly | **DEFERRED** with the family: `progress/track` does not match `--muted`, so migrating only the fill would leave the component half-converged |
| `NotificationMenu` unread count | **notification indicator** | `status/*`? | ❌ | **DEFERRED — ambiguous** |
| `avatar` corner indicator | **presence / status dot** | `status/*`? | ❌ | **DEFERRED — ambiguous** |
| `TourOverlay` spotlight ring | **highlight**, not keyboard focus | ? | ❌ | **DEFERRED — ambiguous** |
| `input` text-selection highlight | **text selection** | `selection/surface` | ❌ | **DEFERRED** |
| `switch` thumb in Dark | foreground pair | `text/on-primary` | ❌ | **DEFERRED** (measured in §10.8) |
| 4 Catalog files | brand accents | — | n/a | **inert** — Catalog `brand/default` already equals its `--primary` |

**Why navigation and selection could not be inert.** Production paints both as a **solid fill**
(`bg-primary` + `text-primary-foreground`). The approved roles are a **subtle tint** —
`navigation/selected` and `selection/surface` both alias `brand/subtle` (`#f0fdf1` in Light). Those
are different designs, not different values, so no pin can bridge them. Resolving it is a product
decision and was **not** made here.

#### Generic Badge finding

`Badge variant="default"` — the variant that consumes `action/primary` — is used in **exactly two
places**: `CatalogSettingsCard` and `SellerCatalogCard`, both rendering **"Activo" / "Inactivo"** for
a catalog **link state**. Every other Badge usage is `secondary` (role labels, "Archivado" — neutral
metadata) or `outline` (StatusBadge and friends, which supply their own palette).

So the generic Badge default is **a state indicator, not brand emphasis**. On activation those two
badges would turn brand green purely because the implementation happens to consume `primary`.
**Minimum correction, deferred for decision:** reclassify `Badge variant="default"` away from
`action/primary` before 3B2. `StatusBadge` was not touched and «Abonada» was not touched.

#### Compatibility pins added (second fenced block; the Wave 1 block was NOT altered)

| Role | Pinned to | Rationale |
|---|---|---|
| `text/brand` | `--primary` | what links paint today |
| `focus/ring` | `--ring` | what the focus ring paints today; in Catalog both values already coincide, so the pin is a no-op there |

Each pin targets **that role's own current appearance** — the pins deliberately do **not** funnel
every brand role to one legacy colour.

**Verified identical in all three scopes** (resolved to sRGB, same method as Waves 1–3A):
`action/primary` `#171717` / `#e5e5e5` / `#843bec` · `focus/ring` `#a1a1a1` / `#737373` / `#eadcff` ·
`text/brand` `#171717` / `#e5e5e5` / `#843bec`. **No compiled utility resolves to `brand/*`.**

**11 files, 19 replacements** (7 controls + 3 dashboard cards + `globals.css` +49/−0).

### 10.11 Brand activation readiness — the gate is NOT met

If **both** pin blocks were removed today, **27 occurrences** would change: `action/primary` 8 (Button,
Badge, Checkbox, Switch), `text/brand` 5 (2 link variants + 3 dashboard links), `focus/ring` 14 (all
7 controls). **Light and Dark only** — Catalog does not move.

**But 21 legacy occurrences across 13 non-Catalog files would NOT change**, and they include the
ones that matter most for coherence: the **selected sidebar item**, the **selected report tab**, the
**selected option and cards**, the notification count, both money progress bars, the avatar
indicator and the tour ring.

| §14 gate condition | Status |
|---|---|
| Primary actions semantic | ✅ |
| Brand text / accent semantic | ✅ |
| Focus understood | ✅ migrated and pinned |
| **Navigation consumers semantic** | ❌ blocked on a design decision |
| **Selection consumers semantic** | ❌ blocked on a design decision |
| **Generic Badge semantics resolved** | ❌ default variant is a state indicator |
| No important legacy consumer left inconsistent | ❌ |
| Progress / Data can stay deferred | ✅ — but only because they stay legacy on both sides |

**Recommendation: keep Brand Activation DEFERRED.** Activating now ships green buttons, links and
focus rings beside a near-black selected sidebar item and selected report tab.

### 10.12 WAVE 3B1B — BRAND ACTIVATION PREREQUISITES (executed 2026-09-06 · **APPROVED** · committed, hash in §11)

**Approved final decisions:** Navigation → the approved Figma treatment is authoritative · True Selection → `selection/*` · ImportDropzone drag-active → brand interaction treatment, **not** Selection · Generic Badge default → decoupled from `action/primary` · «Activo»/«Inactivo» → deferred to the Status migration · Notification count → intentionally neutral for now · `AvatarBadge` → dead/unconsumed · TourOverlay → brand-highlight candidate · Native text selection → intentionally neutral · Switch Dark thumb → deferred control reconciliation · Progress/Data → deferred to their own wave.

Analysis and inert preparation. **No intentional visual change; no pin removed or altered.**

#### Navigation — direction CLOSED, migration belongs to 3B2

The approved `Navigation / Item` (8 variants) binds, in **Selected**:
`fills=navigation/selected` · `fills=text/brand` · `strokes=text/brand` · `fills=navigation/indicator`.
Geometry: **Expanded 208×44, Collapsed 44×44**, surface radius 8, icon 20×20 at (12,12), and a
**3×20 Indicator rectangle at x=0, y=12** that exists **only** in the Selected variants.

| | Production today | Approved target |
|---|---|---|
| Surface | solid `--primary` fill | `navigation/selected` (brand-subtle tint) |
| Label / icon | `--primary-foreground` | `text/brand` |
| Indicator | **does not exist** | 3×20 bar, left edge — **new element** |
| Item height | `min-h-9` = **36px** | **44px** |

Files for 3B2: **`src/components/layout/NavLinks.tsx`** (sidebar, expanded *and* collapsed rail) and
**`src/features/reports/components/ReportNav.tsx`** (report tabs, which additionally carries
`border-primary` and `font-medium`). `BottomNav` must be checked against `Navigation / Bottom` in the
same wave. Light: `#171717` fill → `#f0fdf1` tint with `#0d6427` text. Dark: `#e5e5e5` → `#032d10`
with `#7bef92`. **This is an intentional visual change and was NOT performed here.** The Design
System was **not** modified to preserve the legacy solid fill.

#### Selection — true selection separated from drag-active

| Consumer | Classification | Target | Note |
|---|---|---|---|
| `OptionList` selected option | **true selection** | `selection/surface` | production is a **solid fill** — far from the approved tint |
| `CommissionModelField` selected card | **true selection** | `selection/surface` + `border/brand` | already `border-primary bg-primary/5`, i.e. **already a tint** — closest to the target |
| `ImportDropzone` drag-over | **NOT selection** — a drop-target interaction state | `border/brand` + a brand-subtle surface | represented adequately by existing roles; **no new Core token invented** |

#### Generic Badge — resolved

**The approved system has no generic Badge.** Figma contains only `Badge / Status`
(Success · Warning · Error · Info · Neutral). Production's `Badge` is shadcn boilerplate, and its
`default` variant is used in exactly two places — `CatalogSettingsCard` and `SellerCatalogCard`,
both rendering **"Activo" / "Inactivo"** for a catalog link state.

**Inert correction applied:** `Badge variant="default"` was **decoupled from `action/primary`** and
returned to the legacy token. Identical today (the Wave 1 pin makes the two equal, verified in all
three scopes); on activation those two badges will **not** turn green by inheritance.
**Which `Badge / Status` state they should become is a product decision for the Status wave** —
deliberately *not* auto-mapped to Success/Error. `StatusBadge` untouched; «Abonada» untouched.

#### The remaining consumers, each classified

| Consumer | What it communicates | Verdict |
|---|---|---|
| `NotificationMenu` count | unread / attention | **No approved role covers it**, and it is a *single* consumer — a new token fails the "recurring" test. Stays legacy, **intentionally neutral**, will not flip. Not a blocker. |
| `avatar` corner dot (`AvatarBadge`) | — | **Zero usages in the product** — dead shadcn boilerplate. Nothing to classify. Not a blocker. |
| `TourOverlay` ring | decorative spotlight highlight, `aria-hidden`; **not** keyboard focus | maps to **`border/brand`**. Visual change → optional in 3B2. **Not** mapped to `focus/ring`. |
| `input` text selection | native text selection | `selection/surface` is a very light tint and the text is near-white → **would be unreadable**. Deliberately stays neutral. Not a blocker. |
| `switch` Dark checked thumb | control knob | approved role is **`control/knob`**, which matches production in Light and Dark but **not Catalog**, and does not cover the dark-checked override. Deferred. |
| 3 progress bars | 2 × collection money, 1 × task progress | **Deferred as a family**, per instruction. Not half-migrated. |

#### Verification

`badge.tsx` is the only code change: **1 replacement**, proved inert (`#171717` / `#e5e5e5` /
`#843bec` on both sides). typecheck ✅ · lint ✅ (same 2 pre-existing warnings) · **791 tests** ✅ ·
build ✅ · prettier ✅.

### 10.13 The Wave 3B2 activation plan

**Pins that 3B2 removes** — both fenced blocks: Wave 1 (`action/primary`) and Wave 3B1
(`text/brand`, `focus/ring`).

**Intentional visual changes, in order:**

1. **Pin removal — 25 occurrences turn brand.** Button default + hover (2), Checkbox checked (3),
   Switch checked track (1), `text/brand` links (5), `focus/ring` across the 7 controls (14).
   Light and Dark only; **Catalog does not move**. Checkbox and Switch are confirmed correct: the
   approved components bind `action/primary` in their checked states.
2. **Navigation selected** — `NavLinks`, `ReportNav`, and `BottomNav` after checking it: tint +
   `text/brand` + the new 3×20 indicator + 36→44px height.
3. **True selection** — `OptionList`, `CommissionModelField`.
4. **Optional** — `ImportDropzone` drag-active, `TourOverlay` ring.

**Must be re-measured before shipping:** text on brand · focus ring against brand · brand against
card and muted surfaces — in Light and Dark.

**Verdict: 3B2 is SAFE WITH DOCUMENTED DEBT.** Every accidental brand consumer is now either
semantic, intentionally neutral, or dead code. The one residue is the **three progress bars**, which
stay legacy near-black while the rest turns green — visible in the dashboard and the commission card.
That is a deliberate consequence of keeping the Progress family together for the Data wave, and it is
the only known incoherence.

### 10.14 WAVE 3B2 — BRAND ACTIVATION (executed 2026-09-06 · **APPROVED** · committed, hash in §11)

**The first wave with intentional, approved visual change.** The Rifas brand is live in **Light and
Dark**; **Catalog is unchanged** for the action and focus roles, because its `brand/default` already
equalled its `--primary`.

| Role | Light | Dark | Catalog |
|---|---|---|---|
| `action/primary` | `#171717` → **`#0d7d2d`** | `#e5e5e5` → **`#17c246`** | `#843bec` (unchanged) |
| `focus/ring` | `#a1a1a1` → **`#0d7d2d`** | `#737373` → **`#7bef92`** | `#eadcff` (unchanged) |
| `text/brand` | `#171717` → **`#0d6427`** | `#e5e5e5` → **`#7bef92`** | `#843bec` → `#eadcff` |

#### BottomNav preflight — MISMATCH, so it was migrated

The approved `Navigation / Bottom` is 375×56, bar `surface/card` + `border/default`, items 94×56,
unselected `text/muted`, **selected `text/brand` plus a 28×3 indicator at the top edge** and *no*
selected surface fill. Production already had an indicator and a weight change — but its indicator
was **`--success` emerald, not brand**, its selected foreground was `text-foreground`, its geometry
was 32×2, and its bar used `--background` (which differs from `surface/card` in Dark). Migrated all
four. The unselected `--muted-foreground` was **kept** — `text/muted` is a different value and
belongs to the separate contrast fix.

#### What changed

| Area | Change | Class |
|---|---|---|
| **Pins** | Both fenced blocks deleted — `globals.css` **−84 lines** | APPROVED BRAND ACTIVATION |
| **Button, Checkbox, Switch** | primary/checked resolve to brand | APPROVED BRAND ACTIVATION |
| **Links** (2 variants + 3 dashboard) | `text/brand` resolves to brand | APPROVED BRAND ACTIVATION |
| **Focus** — 7 controls, 14 occurrences | brand-derived ring | APPROVED BRAND ACTIVATION |
| **NavLinks** | solid fill → `navigation/selected` + `text/brand` + a **new 3×20 indicator**; `min-h-9` → **`min-h-11` (44px)**, which also closes the collapsed-nav touch-target item | APPROVED NAVIGATION MIGRATION |
| **ReportNav** | solid fill → tint + `text/brand` + `border/brand`, `font-medium` kept as the non-colour signal | APPROVED NAVIGATION MIGRATION |
| **BottomNav** | bar → `surface/card`; selected → `text/brand`; indicator → `navigation/indicator`, 32×2 → 28×3 | APPROVED NAVIGATION MIGRATION |
| **OptionList, CommissionModelField** | solid fill / legacy tint → `selection/surface` + `border/brand`; both keep their **check icon** as the non-colour signal | APPROVED SELECTION MIGRATION |
| **ImportDropzone** | drag-active → `border/brand` + `brand/subtle` — **not** `selection/*` | APPROVED INTERACTION-HIGHLIGHT MIGRATION |
| **TourOverlay** | `ring-primary` → `border/brand`. Trivial and exact; **not** mapped to `focus/ring` | APPROVED INTERACTION-HIGHLIGHT MIGRATION |

**No UNEXPECTED REGRESSION was found.** 8 files: `globals.css` + 7 consumers, 15 replacements.

#### Contrast gate — 29 of 30 pass

All ten required pairs pass in **Light** (4.83–9.35) and **Dark** (6.38–13.77). In **Catalog**, nine
pass; one fails:

> **`border/brand` on `brand/subtle` in Catalog = 2.68:1** (needs 3:1).

**Not a product regression — the pair is unreachable.** It is the drag-active dropzone, and
`ImportDropzone` renders only inside `TicketImportDialog` in the owner portal, while `.catalog-theme`
is applied solely by `app/(catalogo)/layout.tsx`. Recorded as a **token-level Catalog finding** for
the wave that owns Catalog contrast (Wave 4). **The Design System was not altered to hide it.**

**Switch composition after activation** (§17 check): thumb-on-checked-track passes in all three —
Light 5.27, Dark 8.34, Catalog 3.61 — and the *deferred* Dark thumb override measures **7.54:1**
against the activated green track. No regression, so no stop was required.

#### Responsive

No dev server is available (Docker down), so this was verified by source inspection, not screenshots.
The changes are confined to: **BottomNav** (`md:hidden`, so <768 only), and **NavLinks**, which is the
single implementation consumed by the expanded sidebar (≥1360), the collapsed 56px rail (<1360) and
the overlay sidebar. Item height is width-independent, so 44px applies in all three; the 3px indicator
sits at the item's leading edge in both layouts. No second navigation implementation was created and
no destination or information architecture changed.

#### Residue — measured separately, every consumer classified

*(An earlier draft of this section said "9 occurrences"; that undercounted, because the pattern
skipped some `-foreground` matches. The figures below are the re-measured, authoritative ones.)*

| | Occurrences | Files |
|---|---|---|
| **Non-Catalog legacy-primary residue** | **15 in code** (+1 mention inside a comment) | **10 in code** (+`OptionList`, comment only) |
| **Catalog-only legacy-primary residue** | **11** | **4** |

**Non-Catalog, by reason:**

| Consumer | Occurrences | Why it legitimately stays |
|---|---|---|
| `CollectionSummaryCard`, `CommissionCard`, `BulkTicketCreator` | 3 | the three progress bars — **Progress/Data wave** |
| `badge.tsx` default | 3 | deliberately decoupled in 3B1b — **Status wave** |
| `button.tsx`, `checkbox.tsx` foreground | 2 | `--primary-foreground` deferred in Wave 3A with its measurement. **Re-verified against the now-activated brand: 5.04 Light · 7.54 Dark · 5.34 Catalog — all pass.** |
| `NotificationMenu` count | 2 | intentionally neutral |
| `input.tsx` text selection | 2 | intentionally neutral |
| `switch.tsx` Dark thumb | 1 | deferred control reconciliation; verified safe above |
| `avatar.tsx` | 2 | **dead/unconsumed** shadcn code |
| `OptionList.tsx` | (comment) | prose in a code comment, not a class |

**Catalog-only** — `CatalogHeader`, `CatalogHero`, `CatalogSummary`, `CatalogTicketCard`. Inert,
because Catalog's `brand/default` equals its `--primary`.

**No remaining non-Catalog residue represents an unresolved Brand responsibility from this wave.**

### 10.15 WAVE 4 — DATA DISPLAY & OVERLAYS (executed 2026-09-06 · **APPROVED** · committed, hash in §11)

**Scope verified against both authorities, which agree.** Figma `04` › Implementation waves:
*"Wave 4 · Data display & overlays — Cells, pagination, empty, skeleton, Dialog, Sheet, Menu,
Tooltip, plus the two Catalog contrast fixes. RISK MEDIUM — contained per component, but the Catalog
fixes change a live public surface."* Dependency layer 4 depends on Wave 3. §9 of this file says the
same. **No contradiction.**

#### Status ownership — verified, and it is NOT Wave 4

Read from the Phase 11 plan rather than assumed. **No wave in the plan claims `StatusBadge`'s colour
migration.** Wave 3 lists "Badge", which is the *generic* shadcn Badge (handled in 3A and decoupled in
3B1b). `StatusBadge` is a **Product Component** — the contract says it *"maps a Rifas state to a
system tone and renders `Badge / Status`. It does not restyle it, and it does not reach past it into
tokens."* Wave 4 owns **cells**, and *"in code a status cell is a cell that renders StatusBadge"* —
the wrapper, not the badge's colours.

> **NEW RECONCILIATION ITEM: the Status migration is unassigned.** The 20 `status/*` properties and
> the 10 hardcoded palette classes in `StatusBadge` have no wave. Recommend an explicit Status wave;
> until then it must not be picked up opportunistically. **`StatusBadge` and «Abonada» were not
> touched.**

#### What changed — 8 files, 23 replacements + the 2 Catalog fixes

| Family | Change | Class |
|---|---|---|
| **Table** | `surface/muted` (hover + selected row), `text/default` | APPROVED COMPONENT MIGRATION — inert |
| **Skeleton** | `bg-accent` → `surface/skeleton` | APPROVED COMPONENT MIGRATION — **Light #f5f5f5 → #e5e5e5** (more visible); Dark and Catalog unchanged |
| **Dialog / AlertDialog / Sheet** | `background/default`, `surface/muted`, `surface/accent`, `action/secondary`, and the overlay → `overlay/scrim` | inert except the scrim |
| **Overlay scrim** | `bg-black/50` → `overlay/scrim` | Light `rgba(3,3,3,.5)` — imperceptible; **Dark and Catalog go 0.5 → 0.6 alpha**, a deliberately darker overlay |
| **Menu / Dropdown** | `surface/popover` + `text/on-popover` (menu and submenu), `surface/accent` + `text/on-accent` (4 item types), `border/default` | inert |
| **Tooltip** | `surface/inverse` + `text/on-inverse` (body and arrow) | **Light bg #0a0a0a → #171717, text #ffffff → #fafafa**; Dark mirrored; Catalog unchanged. Contrast 17.18 / 16.44 / 18.19 |
| **Pagination, Empty state, DataTable** | audited — they carry only `text-muted-foreground`, which is the **deferred** Light contrast fix, not a Wave 4 item | no change |

**Deliberately not done:** `text/muted` (the cross-system contrast fix, unassigned to this wave) ·
`border/input` in Light and Dark (deferred with its measurement in Wave 3A) · Table/Row's
`action/primary`, `selection/surface` and `status/success/*` bindings, which are the Figma **sample**
and would have *added* features production does not have · numbered pagination · merging the two
empty states · any Navigation work.

#### The two approved Catalog contrast fixes — both applied, reachability measured

| Fix | Before | After | Reachable? |
|---|---|---|---|
| **`--input`** → `border/input` | **1.75:1** | **3.26:1** ✅ | **YES.** `CatalogSearch` → `SearchInput` → `Input` → `border-input`. **This is the only visible change of the wave on a public screen**: the catalog search field's border becomes distinguishable. |
| **`--destructive`** → `action/destructive` | **3.45:1** | **4.67:1** ✅ | **No** — there is no destructive control inside `.catalog-theme`; the only `text-destructive` in the catalog folder is `CatalogSettingsDialog`, an owner-portal screen. Fixed anyway because the defect is latent. |

Both were done by pointing the legacy `.catalog-theme` variable at the approved token, so the fix
lands once for every consumer instead of per call site.

#### Preserved deliberately

Server-side pagination and its `1–25 de 118 boletas` range · the **two distinct** empty states (empty
dataset vs no results) with their different actions · structural skeletons (no spinner) · numeric
alignment and `tabular-nums` · the non-modal sidebar overlay was **not** given modal focus trapping ·
the destructive-tone rule (Escape still cancels; a destructive outcome needs explicit activation) ·
Tooltip does **not** become the accessible name for icon-only controls.

#### Validation

typecheck ✅ · lint ✅ (same 2 pre-existing warnings) · **791 tests** ✅ · build ✅ · prettier ✅.
Legacy-primary residue **unchanged** (15 code + 1 comment non-Catalog, 11 Catalog) — Wave 4 touched
no brand responsibility. **No live screenshots: Docker/Supabase is unavailable, so responsive and
theme checks were compiled-CSS, resolved-value and source inspection.** Table→card-list at 768 is a
`TicketCardList`/`DataTable` composition that this wave did not touch.

> **NEW FINDING, needs verification, not fixed here:** in **Dark**, `--destructive-foreground`
> (`#fafafa`) on `--destructive` (`#ff6467`) measures **2.75:1**. It is pre-existing and outside the
> two approved Catalog items. `Button` destructive uses `text-white`, so the pair may not be
> reachable — worth confirming in the wave that owns destructive semantics.

### 10.16 WAVE 4.5A — STATUS SEMANTICS AUDIT & MAPPING (2026-09-06 · **APPROVED** · documentation checkpoint, hash in §11)

**Inserted to close a verified planning gap.** The original seven-wave plan assigned no owner to
`StatusBadge` or to the product-state → status-tone mapping. This is an **audit and decision phase**;
**no production code was changed** and nothing was recoloured.

#### The gap is bigger than StatusBadge

`StatusBadge` holds **10 hardcoded palette occurrences** in 5 families (amber · sky · emerald · rose ·
slate) across 4 class maps — the earlier count was right. But re-auditing at HEAD found **18 further
files carrying their own hardcoded status palettes**, including four that render status badges
entirely outside `StatusBadge`: `LotteryScheduleBadge`, `PaymentsTable` (Activo / Anulado),
`TicketPaymentsCard` and `ImportPreview`. **The product-status treatment is scattered across 19
files, not one.**

Two more findings from the same pass: **`ActiveBadge` has zero usages** (dead code, like
`AvatarBadge`), and **`ClientsTable` renders `<Badge variant="secondary">Archivado</Badge>` directly**
instead of using `ClientStatusBadge` — the same product state with two different treatments.

#### Product-state → tone matrix (proposed, NOT applied)

Tone proposed from **product meaning**, never from the current colour.

| Product state | Label | Meaning | Now | Proposed | Change? | Confidence |
|---|---|---|---|---|---|---|
| `inventory.draft` | Borrador | not ready yet; not a problem | muted | **Neutral** | minimal | **HIGH** |
| `inventory.available` | Disponible | ready to sell; informational, not yet an achievement | sky | **Info** | yes | MEDIUM |
| `inventory.assigned` | Asignada | sold — the desired outcome | emerald | **Success** | small | **HIGH** |
| `payment.unpaid` | Sin pagar | normal starting state, nothing owed yet | muted | **Neutral** | minimal | **HIGH** |
| `payment.paid` | Pagada | fully paid | emerald | **Success** | small | **HIGH** |
| `raffle.draft` | Borrador | unpublished | muted | **Neutral** | minimal | **HIGH** |
| `raffle.closed` | Cerrada | finished normally — an end, not a failure | slate | **Neutral** | small | **HIGH** |
| `client.archived` | Archivado | out of the list, reversible. The code says outright: *"Archivar no es un error ni una anulacion"* | slate | **Neutral** | small | **HIGH** |
| `account.pending` | Invitación pendiente | BR-E14: a **wait**, explicitly not a punishment | amber | **Info** | yes | MEDIUM |
| `payment.partial` | **Abonada** | see below | amber | **Info** | **yes** | **APPROVED** |
| `inventory.pending_approval` | Pendiente de aprobación | a normal step that nonetheless **needs someone to act** | amber | **Warning** | small | **APPROVED** |
| `inventory.cancelled` / `raffle.cancelled` | Anulada | deliberate withdrawal, not a failure | rose | **Neutral** | **yes** | **APPROVED** |
| `account.inactive` | Inactivo | access disabled — deliberate, not a failure | rose | **Neutral** | **yes** | **APPROVED** |
| `raffle.active`, `client.active`, `account.active`, catalog link Activo | Activa / Activo / Cuenta activa | the desired **operational** state — enabled, usable, working | emerald | **Success** | small | **APPROVED** |

**ALL 14 MAPPINGS APPROVED 2026-09-06. BLOCKED: 0.** The five tones covered every state; no gap in
the Design System was found.

#### The semantic rules behind the mapping — these, not the Spanish label, are the authority

| Meaning | Tone |
|---|---|
| **Normal but incomplete** | **Info** |
| **Requires human attention** | **Warning** |
| **Completed / desired operational state** | **Success** |
| **Intentional cancelled · archived · inactive** | **Neutral** |
| **Actual failure or problem** | **Error** |

These are **semantic guidelines, never string-to-tone rules**. `Pendiente de aprobación` is Warning
because someone must act; `Invitación pendiente` is Info because it is only a wait — **the same
Spanish word, two tones.** No logic may branch on a label.

#### «Abonada» — audited explicitly

Evidence, not colour: `Abonada` is `0 < paid < sale_price` — **the normal middle of every sale**.
Nothing in the schema or the rules ties it to a due date, and there is **no overdue concept** for
tickets. `tones.ts` calls it *"abonos: boletas pagadas a medias"*, and its sibling `pending` is
explicitly grey because *"es «todavia no», no «mal»"*. So it is **healthy and in progress**, and it
does **not** require attention → **Warning is not supported by the evidence; Info is the proposal.**

It is still **NEEDS PRODUCT DECISION**, for one reason: production's amber currently means *"falta un
paso"* and is shared by **three** states (Abonada, Pendiente de aprobación, Invitación pendiente). A
tone mapping would split that convention, and Abonada is the highest-frequency badge in the product
(9 call sites). That is a product call, not a design-system one.

#### Status vs Product Data vs Progress — the boundary holds

**Three separate roles that may end up visually related but must not be collapsed:**
Status **«Abonada»** = the entity's payment state · **`data/partial`** = the colour of *abonos as a
quantity* in figures and charts · **`progress/value`** = how far a bar has advanced. The verified
production conflict is carried forward unresolved: system `sky` · dashboard `blue` · progress bars and
card lists `amber` · the `StatusBadge` chip `amber`. **4.5A classifies; it does not resolve.**

#### Activo / Inactivo, and the generic Badge

The glossary is explicit: *"«Activo» / «Inactivo» describen el ENLACE, no a la persona… Inactivo aquí
significa que la dirección no abre"*. So **Inactivo is an off state, not an error → Neutral (HIGH)**;
Activo → Success or Info (**MEDIUM**). Generic-Badge consumers classify as: **STATUS** —
`ClientsTable`, `CatalogSettingsCard`, `SellerCatalogCard`, `LotteryScheduleBadge`, `PaymentsTable`,
`TicketPaymentsCard`, `ImportPreview`; **NEUTRAL METADATA** — the two role-label badges;
**PRODUCT-SPECIFIC LABEL** — `CatalogTicketCard`; **OTHER** — two `ReportsView` annotations. Only the
STATUS group is a candidate for 4.5B.

#### Accessibility and the destructive pair

**No violations.** Every badge renders its Spanish label as visible children; there is no icon-only
status anywhere, and no `sr-only` substitution. The contract holds as written.

**`text/on-destructive` on `action/destructive` in Dark = 2.75:1 — UNREACHABLE.** Verified:
`text-text-on-destructive` has **0 consumers**, `--destructive-foreground` has **0 consumers in code**
(it is declared and exported but never used), and `Button` destructive bypasses the pair with
`text-white`. Classified **UNREACHABLE / LATENT TOKEN DEBT**, owner = whichever wave takes destructive
semantics. **Not fixed here**, and `action/destructive` remains distinct from `status/error`.

#### Proposed Wave 4.5B blast radius

| | |
|---|---|
| Source files | **1** (`StatusBadge.tsx`) + **18** satellite files with their own status palettes |
| State renderings | **17** live (19 minus the 2 dead `ActiveBadge` branches) |
| Consuming files | **19** for `StatusBadge` |
| Owner reach | yes · **Seller reach** yes · **Catalog reach 0** |
| Visual change | **Light and Dark**; Catalog unaffected |
| **Risk** | **HIGH** |

Why HIGH: it repaints the highest-frequency chips in the product — every ticket row, every payment
row, both card lists — across two portals; the surface is 19 files rather than one; and **6 mappings
covering 9 renderings still need a product decision.**

> **DECISION GATE PASSED 2026-09-06.** All six open mappings were closed by the user, so Wave 4.5B
> became authorized. «Abonada» is **Info** — an intentional semantic correction, explicitly NOT
> preserving amber just because production paints it that way.

### 10.17 WAVE 4.5B — STATUS SEMANTIC MIGRATION (2026-09-06 · **COMPLETED AND APPROVED** · commit in §11)

**9 files.** The product's status treatment stops being ten copied palette strings and becomes one
tone architecture.

#### Architecture chosen — three pieces, each deciding one thing

```
product state  →  tone            →  colours        →  chip
(constants.ts)    (constants.ts)     (StatusBadge)     (StatusBadge)
```

1. **State → tone** lives in `src/lib/constants.ts`, **beside the labels it already owned**, as five
   small per-domain maps (`TICKET_INVENTORY_STATUS_TONES`, `TICKET_PAYMENT_STATUS_TONES`,
   `RAFFLE_STATUS_TONES`, `ACCOUNT_STATUS_TONES`, `CLIENT_STATUS_TONES`). Changing what a state
   *means* stays a one-file change, exactly like changing its label.
2. **Tone → colours** lives once, in `TONE_CLASSES` inside `StatusBadge.tsx`.
3. **`<StatusBadge tone=…>`** renders the chip and knows nothing about the business.

**Why not one global registry:** the domains are unrelated — a lottery schedule has nothing to do
with a ticket's payment — so a single table would couple them for no gain. **Why not per-component
maps:** that is exactly the duplication this wave removed. Small maps next to their own labels is the
smallest thing that removes the duplication without the coupling. Domains outside `constants.ts`
(lottery schedule, importer rows) keep their tone map next to their own constants.

**The prop is `tone`, not the contract's `status`.** In this codebase `status` already names the
*business* state (`status={ticket.inventoryStatus}`); having both under one name a centimetre apart
reads badly. The Figma contract's own rule — a Figma limitation must not dictate the API — covers a
naming choice like this.

#### What changed

| File | Change |
|---|---|
| `src/lib/constants.ts` | +5 tone maps, +`StatusTone` type, +the semantic rules as a comment |
| `StatusBadge.tsx` | **10 hardcoded palette occurrences → 5 tone strings**; 6 domain badges become thin state→tone wrappers; new generic `StatusBadge` export |
| `LotteryScheduleBadge.tsx` | its own 8-state palette map → a tone map |
| `PaymentsTable.tsx` | Activo → `success`, Anulado → `neutral` |
| `TicketPaymentsCard.tsx` | Anulado → `neutral` |
| `ImportPreview.tsx` | 5 row states → tones |
| `ClientsTable.tsx` | **duplication resolved** — the raw `<Badge variant="secondary">Archivado</Badge>` and the plain "Activo" span both replaced by `<ClientStatusBadge>` |
| `CatalogSettingsCard.tsx`, `SellerCatalogCard.tsx` | catalog-link Activo → `success`, Inactivo → `neutral` |

#### The 13 rule-derived mappings — FINAL AUDIT · **GATE PASSED 2026-09-06**

**5 HIGH-confidence · 8 previously MEDIUM, now approved by product decision · 0 needing decision ·
0 blocked.** The eight open mappings were closed by the user, and **four shipped tones were corrected
as a result** — recorded as **APPROVED STATUS SEMANTIC CORRECTIONS**, not regressions:

| State | Was shipped | Now |
|---|---|---|
| `schedule_unverified` | Warning | **Info** — the glossary treats "Horario por confirmar" as a normal state; a missing confirmation is not evidence of a problem |
| `schedule_conflict` | Error | **Warning** — the schedule is contradictory and needs verifying; it is **not** the BR-L26 *result* conflict |
| `duplicate` | Warning | **Neutral** — an ordinary skip, not a failure |
| `taken` | Warning | **Neutral** — already-existing data is a valid skip, especially on re-import |


Two domains were outside the approved 14. Re-audited against **actual product behaviour**, and the
audit **overturned two of my own earlier rationales**.

**Lottery schedule (8).** Evidence: the visible labels in `features/lottery/constants.ts`, and
`isNotableSchedule()` in `dashboard.ts`, which groups six states as *notable* — worth surfacing, which
is **not** the same as *requires action*.

| Identifier | Label | Behaviour | Tone shipped | Confidence |
|---|---|---|---|---|
| `scheduled` | Programado | normal, proceeds | **Info** | **HIGH** |
| `completed` | Realizado | finished | **Success** | **HIGH** |
| `cancelled` | Cancelado | intentional cancellation | **Neutral** | **HIGH** |
| `rescheduled_later` | Aplazado | moved; proceeds, nobody must act | **Info** | APPROVED |
| `rescheduled_earlier` | Adelantado | moved earlier; proceeds | **Info** | APPROVED |
| `suspended` | Suspendido | halted by the lottery, not by us | **Warning** | APPROVED |
| `schedule_unverified` | Horario por confirmar | the glossary treats this as a **normal** state | **Info** | APPROVED |
| `schedule_conflict` | La programación oficial **requiere verificación** | needs checking | **Warning** | APPROVED |

> **Correction to my own earlier claim.** I justified `schedule_conflict → Error` with BR-L26 and
> "the screen shows no number". **That was wrong.** BR-L26 governs a **result** conflict, and the code
> keeps that separate — `resultKind()` reads `result.validationStatus === 'conflict'`, a different
> field. `schedule_conflict` is about the **schedule**, and its own label says *requires
> verification*, which reads as attention, not failure. **Warning is the better-evidenced tone**, and
> the shipped `Error` should be revisited.

**Importer rows (5).** Decisive evidence in `review.ts`:
`const validRows = reviewed.filter((row) => row.status === 'valid')` — **only `valid` rows are
imported; every other state is skipped**, not merely flagged.

| Identifier | Label | Imports? | Tone shipped | Confidence |
|---|---|---|---|---|
| `valid` | Válida | **yes** | **Success** | **HIGH** |
| `invalid` | No se puede usar | no | **Error** | **HIGH** |
| `duplicate` | Repetida en el archivo | no — ordinary skip | **Neutral** | APPROVED |
| `taken` | Ya existe en la rifa | no — ordinary skip | **Neutral** | APPROVED |
| `client-conflict` | Conflicto de cliente | no | **Error** | APPROVED |

> **Second correction.** I described `duplicate` / `taken` as *"can proceed but needs attention"* —
> **they cannot proceed**. Under the approved definitions that makes Warning wrong, and the fit is
> either **Error** (cannot be processed) or **Neutral** (*"skipped / ordinary terminal condition"*).
> Re-uploading a file and seeing "Ya existe en la rifa" is ordinary, so **Neutral** looks better —
> but this is a product call, not a rules deduction.

**FINAL SEMANTIC RULES.** Normal valid information or change → **Info** · exceptional condition
requiring attention or verification → **Warning** · actual invalid or contradictory condition that
prevents correct processing → **Error** · ordinary skip or normal terminal condition → **Neutral** ·
successfully valid or completed → **Success**. Guidelines, never string matching: nothing branches on
«conflict», «pending» or «not imported».

#### Visual changes — all APPROVED STATUS SEMANTIC CORRECTIONS

**«Abonada» amber → Info** is the headline and the highest-frequency chip in the product.
**Anulada / Inactivo rose → Neutral** removes red from states that were never failures.
**Disponible sky → Info** and **Pendiente de aprobación amber → Warning** keep their family.
`ClientsTable` "Activo" gains a real chip where it had plain grey text — an **APPROVED CONSISTENCY
FIX**. Everything else keeps its family and shifts only to the system's exact token values.

#### Contrast — all five tones, all three themes

Text on surface: **Light 8.00–14.46 · Dark 10.44–13.34 · Catalog 10.44–13.34.** Every tone passes
4.5:1 in every theme, with margin. **Accessibility unchanged and intact:** every chip still renders
its Spanish label as visible children; no icon-only status was introduced anywhere.

#### The firewall held

**Nothing** in `data/partial`, `PaymentProgressBar`, `CollectionSummaryCard`, `CommissionCard`,
`BulkTicketCreator`, `TrendChart`, `DonutChart` or the dashboard palette was touched. Status
«Abonada» is now Info while the payment progress bars stay amber — **that temporary difference is
accepted and expected**; they are separate semantic responsibilities and the Data wave reconciles
them. `action/destructive` was **not** merged with `status/error`.

#### Remaining Status debt

**Zero badges carry a palette class**, and the five tone strings exist exactly once.

#### UNASSIGNED DESIGN SYSTEM COMPONENT GAP — Alert / Notice · **PILOT PREREQUISITE**

What remains is a **different UI pattern**: four inline **status notice panels** — not chips. The
Design System defines **no Alert/Notice component** (§4 lists none), so there is no contract to
migrate them onto, and none was invented here.

| File | What it communicates | Tone it represents |
|---|---|---|
| `owner/dashboard` | "Hay N boleta(s) pendientes de aprobación", with an alert icon | Warning |
| **`seller/clients/[clientId]`** | "Este cliente está archivado: no aparece al asignar boletas…" (required by D-113) | **Neutral** |
| `seller/team/[sellerId]` | the invitation was sent and the password is not set yet | **Info** |
| `PaymentForm` | the allocation validates / does not | Success · Warning |

> **This is a PILOT PREREQUISITE.** `seller/clients/[clientId]` is **inside the approved Clientes /
> Seller pilot**. Worse, two of the four now **contradict their own badge**: after this wave the
> archived client shows a **Neutral** chip above an **amber** panel, and the pending invitation shows
> an **Info** chip above an **amber** panel. The pilot cannot be called coherent until the
> Alert/Notice pattern exists.

`ActiveBadge` remains dead legacy: not deleted, but re-expressed through tones because its old palette
constants no longer exist.

### 10.18 WAVE 5 — PREFLIGHT (2026-09-06 · **APPROVED FOR EXECUTION**)

**Original scope** (Figma `04` › Implementation waves + dependency layer 5, which agree):
*"Wave 5 · Navigation & shell — Sidebar states, collapsed target 40 → 44, selected treatment gains
the brand indicator. RISK MEDIUM."* Layer 5 lists **Sidebar widths and states, bottom nav, page
header, account menu**; it depends on 3 and 4, and the overlay sidebar on the Wave 1 scrim tokens.

#### Already done — PRE-EMPTED / COMPLETED IN WAVE 3B2

| Original responsibility | Status |
|---|---|
| `NavLinks` selected semantics | ✅ 3B2 — `navigation/selected` + `text/brand` |
| Selected indicator | ✅ 3B2 — the 3×20 bar, which did not exist before |
| **Collapsed target 40 → 44** | ✅ 3B2 — `min-h-9` → `min-h-11` |
| Expanded / collapsed / overlay item treatment | ✅ 3B2 — one component serves all three |
| `ReportNav` selected treatment | ✅ 3B2 |
| `BottomNav` selected treatment + indicator | ✅ 3B2 — including its 28×3 indicator and `surface/card` bar |
| Brand navigation roles | ✅ 3B2 |
| Menu / Dropdown semantics behind the account menu | ✅ Wave 4 |
| Shell typography | ✅ Wave 2 |

**Both headline items of the original Wave 5 — the selected treatment and the 44px target — are
already shipped.** Do not migrate them again.

#### What actually remains — 2 files

| Family | File | Remaining | Risk |
|---|---|---|---|
| **Sidebar container** | `AppSidebar.tsx` | `bg-background` → `surface/card`; the `bg-foreground/20` overlay scrim → **`overlay/scrim-subtle`**, which the token contract created for exactly this ("two strengths, because the modal dialog and the non-modal sidebar are different things"); `shadow-xl` → `elevation/shadow/strong` | the only visible one |
| **Application Shell** | `AppShell.tsx` | `bg-background` → `background/default` | inert |
| **Page / Header** | `PageHeader.tsx` | **nothing.** API already complete — title, `titleBadge`, description, actions, `compactAction`, `backHref`, `backLabel`. Typography migrated in Wave 2; its badge is a StatusBadge, tone-based since 4.5B | — |
| **Account menu** | `UserMenu.tsx` | **nothing.** Surface, border, elevation and item colours all come from `dropdown-menu.tsx`, migrated in Wave 4; typography in Wave 2 | — |

**Measured deltas for the one visible change:** sidebar surface Light `#ffffff` → `#ffffff` (same),
**Dark `#0a0a0a` → `#171717`** (a raised surface, which is the Dark design intent). Scrim Light
`#0a0a0a` at 20% → `overlay/scrim-subtle` `#0a0a0a33`, **identical**; Dark 20% → 25%, slightly denser.

**Verified and to be preserved unchanged:** below 1360 collapsed rail · at/above 1360 expanded ·
fluid 208 → 232 by 1600 · the overlay is **non-modal** — the code says so outright
(*"No es un dialogo: sin `aria-modal` ni cepo de foco"*) and **must not gain a focus trap**. The stale
"collapses at 1360" reading was not resurrected. `compactAction` is used in **10** files today, not
the nine the contract records — minor drift, no action needed.

**Re-scoped risk: LOW** (was MEDIUM). Two files, four changes, one visible and confined to the Dark
sidebar surface. The original risk came from the selected-state redesign, which 3B2 already absorbed
and shipped.

**Explicit exclusions:** all navigation work completed in 3B2 · `text/muted` and `border/input`
(deferred cross-system reconciliation) · the Alert/Notice component gap · Progress, `data/partial`,
dashboard palette and charts · dead-code cleanup.

### 10.19 WAVE 5 — NAVIGATION & SHELL, RE-SCOPED (2026-09-06 · **COMPLETED AND APPROVED** · commit in §11)

**2 production files, 4 changes.** The original wave's two headline items — the selected-navigation
treatment and the 40 → 44px target — were **already shipped by Wave 3B2** and were not touched again.

| Responsibility | Outcome |
|---|---|
| NavLinks · ReportNav · BottomNav · selected indicator · 44px target · brand navigation roles | **PRE-EMPTED / COMPLETED IN WAVE 3B2** — not re-migrated |
| **Sidebar container** (`AppSidebar.tsx`) | **migrated** — 3 changes |
| **Application Shell** (`AppShell.tsx`) | **migrated** — 1 change |
| **Page / Header** | **ALREADY COMPLIANT / NO CODE CHANGE** |
| **Account menu** | **ALREADY SATISFIED BY THE WAVE 4 MENU/DROPDOWN MIGRATION** |

#### The four changes

| Change | Class |
|---|---|
| Sidebar surface `bg-background` → **`surface/card`** — the bar is an *elevated layer*, not a piece of the canvas | **APPROVED DARK SURFACE CORRECTION** |
| Overlay scrim `bg-foreground/20` → **`overlay/scrim-subtle`** — the token the contract created for the non-modal case, deliberately **not** the dialog's `overlay/scrim` | **APPROVED NON-MODAL OVERLAY CORRECTION** |
| Overlay elevation `shadow-xl` → `shadow-xl` **+ `elevation/shadow/strong`** — the **colour** comes from the token, the geometry stays in CSS, exactly as the Wave 1 contract states. No new shadow, no extra level | **APPROVED SHELL SEMANTIC MIGRATION** |
| Shell `bg-background` → **`background/default`** | **APPROVED SHELL SEMANTIC MIGRATION** — inert |

*Clarification found during execution:* `AppShell`'s `bg-background` is on the **sticky mobile
header**, not the application canvas — the canvas background comes from `body` in `globals.css`,
which was not touched. `background/default` is right for both, and the change is inert either way.

#### Measured visual result

| | Light | Dark |
|---|---|---|
| Sidebar surface | `#ffffff` → `#ffffff` — **unchanged** | `#0a0a0a` → **`#171717`** — intentional |
| Overlay scrim | `#0a0a0a` @20% → `#0a0a0a33` — **identical** | 20% → **25%**, slightly denser |
| Shell header | unchanged | unchanged |

**Sidebar content contrast on the new surface** (§19 required this — the old figures were not assumed
to carry over):

| Pair | Light | Dark |
|---|---|---|
| Unselected label | 4.73 (unchanged) | **7.63 → 6.91** — lower on the lighter surface, still well clear of 4.5 |
| Selected label on `navigation/selected` | 6.98 | 10.53 |
| Indicator on the surface | 5.27 | 7.55 |

**No unexpected regression.** The diff is four class swaps plus comments — no logic, no geometry, no
attributes.

#### Behaviour and responsive — verified unchanged

`globals.css` was **not touched**, so every responsive rule is byte-identical: below 1360 collapsed ·
at/above 1360 expanded · fluid 208 → 232 by 1600 · 375 bottom-nav shell · 768 collapsed architecture.
The overlay stays **non-modal**: `aria-modal` appears in the file **only inside a comment** saying it
is deliberately not a dialog, and **no focus trap was added**. Escape-close, focus return,
`aria-expanded` / `aria-controls` and the toggle are untouched.

**Catalog was not validated as a shell consumer** — the admin shell does not render there, and no
composition was invented for symmetry. **No live screenshots: Docker/Supabase unavailable**;
validation was compiled CSS, resolved values, source inspection and the test suite.

**`compactAction` corrected: 10 files, not nine.** Documentation drift only — corrected in Figma; the
API is unchanged and no usage was added or removed.

**Remaining Wave 5 debt: none.** The excluded items belong elsewhere: `text/muted` and `border/input`
(cross-system reconciliation), the two latent token pairs, and the **Alert/Notice component gap, which
remains an unassigned gap and a Clientes-pilot prerequisite**.

---

### 10.20 WAVE 6 — DATA VISUALISATION (2026-09-06 · **COMPLETED AND APPROVED** · commit in §11)

**10 production files + the token layer.** Executed in two parts: the graphical migration the Figma
contract described, and then an **evidence-backed correction to the token contract itself** after
measurement proved the graphical roles are not safe for normal text.

#### Part 1 — graphical Product Data (6 files)

| Role | Light: was → now | Dark: was → now | Classification |
|---|---|---|---|
| `data/paid` | `#009966` → same | `#00d492` → same | **INERT** |
| `data/unpaid` | `#e7000b` → same | `#ff6467` → same | **INERT** |
| `data/partial` | `#155dfc` → `#0084d1` | `#51a2ff` → `#00bcff` | **APPROVED PRODUCT DATA SEMANTIC CORRECTION** — blue → sky |
| `data/pending` | `#c7c7c7` *(effective, 40% alpha)* → `#a1a1a1` | `#4e4e4e` → `#737373` | **APPROVED CORRECTION** — the alpha is dropped; the role already encodes the intended lightness |
| `data/positive` | `#009966` → `#007a55` | `#00d492` → same | **ACCESSIBILITY FIX** — 3.65:1 → 5.36:1 |
| `data/negative` | `#e7000b` → same | `#ff6467` → `#ff637e` | 6.21 → 6.26 in Dark |

`PaymentProgressBar` was **amber** for `partial` — never on the `tones.ts` scale — and now joins the
same role. Its `unpaid` fill was grey and maps to **`data/pending`, not `data/unpaid`**: "not yet
collected" is a normal pending quantitative condition, not an alarm. Approved 2026-09-06.

#### Part 2 — THE CONTRACT DEFECT, and the four roles that fix it

Migrating the text consumers onto the graphical roles would have shipped **eight WCAG 1.4.3
regressions**. The roles are calibrated for chart marks, and the real backgrounds are worse than
white: these consumers sit on `bg-card` **with a hover state** (`bg-muted`, or `bg-muted/50`), and
`PaymentAllocationCards` also has a `bg-destructive/5` issue state.

Measured on the **hover** surface — the binding constraint — every legacy value fails as text:

| Graphical role | Light value | On `#f5f5f5` | Verdict |
|---|---|---|---|
| `data/paid` | emerald/600 `#009966` | **3.35:1** | fails |
| `data/partial` | sky/600 `#0084d1` | **3.69:1** | fails |
| `data/unpaid` | red/600 `#e7000b` | **4.38:1** | fails |
| `data/pending` | neutral/400 `#a1a1a1` | **2.58:1** | fails |

`red/600` and `neutral/500` were **already failing in production** on hover before this wave. That is
a pre-existing defect this wave closes, not one it introduced.

**Resolution: the contract gained four evidence-backed text-safe roles**, one per meaning actually
demonstrated by a real text consumer. No role was invented for symmetry; `data/positive` and
`data/negative` got none because no text consumer needs one.

| New role | Light | Dark | Catalog | Scope |
|---|---|---|---|---|
| `data/paid/foreground` | emerald/700 `#007a55` | emerald/400 `#00d492` | emerald/400 `#00d492` | `TEXT_FILL` |
| `data/partial/foreground` | sky/700 `#0069a8` | sky/400 `#00bcff` | sky/400 `#00bcff` | `TEXT_FILL` |
| `data/unpaid/foreground` | red/700 `#b80008` | red/400 `#ff6467` | red/400 `#ff6467` | `TEXT_FILL` |
| `data/pending/foreground` | neutral/550 `#666666` | neutral/400 `#a1a1a1` | neutral/400 `#a1a1a1` | `TEXT_FILL` |

**Every value already existed in the approved primitive ramps** — no primitive or ramp correction was
needed, and no one-off literal was invented. The conceptual contract is now:

* `data/<meaning>` → the **graphical** representation (fills, strokes, chart marks)
* `data/<meaning>/foreground` → the **textual** representation of that same meaning

Note `data/pending/foreground` is **lighter** than `data/pending` in Dark and **darker** in Light.
That is correct and expected: the graphical role is a deliberately low-emphasis track, and the text
role has to be readable.

**Figma also stopped advertising the graphical roles for text.** `data/paid`, `data/partial` and
`data/pending` carried a `TEXT_FILL` scope, so the variable picker offered them for text — the exact
mistake the measurement disproved. That scope was removed; values and names are untouched, and they
now match `data/unpaid`, which never had it. Each carries a description pointing at its `/foreground`
counterpart.

#### WCAG gate — every migrated Product Data text consumer, on its ACTUAL surfaces

| Consumer | Surfaces measured | Light worst | Dark worst |
|---|---|---|---|
| `CollectionStatusCard` (`text-xs`) | card, hover `bg-muted` | **4.92** | **5.24** |
| `TicketsOverviewCard` (`text-2xl`) | card, hover `bg-muted` | **4.92** | **5.24** |
| `ClientTicketCardList` | card, hover `bg-muted/50` | **5.14** | **7.56** |
| `TicketPaymentSummary` | card | **5.36** | **6.94** |
| `PaymentAllocationCards` | card, issue `bg-destructive/5` | **4.91** | **6.53** |
| `SellerKpis` trend | card (no hover) | **4.77** | **6.26** |

**Worst case across every migrated Product Data text consumer, both themes, every surface: 4.77:1.
Zero failures.** **Catalog was not measured for these consumers because none is reachable under
`.catalog-theme`** — verified against the route's import graph; the public catalog renders only its
own components. The Catalog mode is defined on all four roles anyway, since every Color variable
carries three modes.

#### Graphical contrast — the non-text requirement, not the text one

| Surface | Light | Dark |
|---|---|---|
| `data/paid` fill and stroke | 3.65 (inert) | 9.25 (inert) |
| `data/partial` fill and stroke | 5.25 → 4.02 | 6.80 → **8.23** |
| `data/unpaid` fill and stroke | 4.77 (inert) | 6.21 (inert) |
| `data/pending` track | 1.69 → **2.58** | 2.15 → **3.78** |
| `PaymentProgressBar` partial | 2.13 → **4.02** | 10.41 → 8.23 |

`data/pending` is a track/remainder colour and sits below 3:1 in Light, but it **improves** from 1.69,
and colour is never its sole carrier of meaning: every consumer writes the value out and pairs it with
a text label or badge (D-124, `CLAUDE.md` §27).

#### Consumer classification

| Consumer | Class | Outcome |
|---|---|---|
| `tones.ts` `TONE_FILL` / `TONE_STROKE` | **A. Product Data, graphical** | `data/*` |
| `tones.ts` `TONE_TEXT` | **A. Product Data, textual** | `data/*/foreground` |
| `TrendChart` | **A. Product Data** | `data/paid` — single real series, API unchanged |
| `ProgressRing` | **A. Product Data** | `data/paid` — its one consumer is `TicketPaymentSummary`, "Abonado el X% del precio de venta". **Not a chart**: shared geometry with Donut does not make it one, and its API was not broadened |
| `DonutChart` | **A. Product Data** | takes its colours from `tones.ts`; segment semantics unchanged |
| `PaymentProgressBar` | **A. Product Data** | `data/pending` · `data/partial` · `data/paid` |
| `SellerKpis` collection bar | **A. Product Data** | `data/paid` |
| `SellerKpis` up/down delta | **C. Trend** | `data/positive` / `data/negative` |
| `ClientTicketCardList` · `TicketPaymentSummary` · `PaymentAllocationCards` | **A. Product Data, textual** | `data/*/foreground` |
| `CollectionSummaryCard` · `CommissionCard` | **B. Advancement toward completion** | **PROGRESS SEMANTIC RECONCILIATION DEBT** — deferred until the Progress family has an owner |
| `BulkTicketCreator` saving progress | **B. Process progress** | **Progress family debt** — must stay outside `data/*` |
| `RecentActivityCard` | **E. Record state** (active vs voided payment) | deferred to whichever family eventually owns that product state |
| `MetricCard` | **D. No colour migration needed** | no palette classes |
| Notice boxes, Lottery pills, `PaymentForm`, `ClearanceReceipt*`, `UserDialog`, `TeamCommissionDialog`, `BulkActionDialog`, `BulkAssignDialog`, `TicketImportDialog` | **Status / Alert / Notice** | **FIREWALLED — untouched** |

#### Status / Data / Progress firewall — intact

Status "Abonada" is `status/info`; the Product Data partial amount is `data/partial`; its text is
`data/partial/foreground`; generic progress stays outside `data/*` entirely. None of the forbidden
aliases exists: no `data/*` resolves to a `status/*` role, no `progress` consumer resolves to
`data/*`, and `data/paid/foreground` is **not** `data/positive` — they only happen to share a value
in Light, from two independent decisions.

#### Hardcoded Product Data palette audit — zero remaining

31 palette occurrences remain in `src/`, and **none is Product Data**: 12 Alert/Notice boxes,
10 Lottery result presentation, 3 `ClearanceReceipt*` delivery state, 2 `PaymentForm` allocation
notice, 1 `CommissionCard` notice, 1 `RecentActivityCard` record state, 1 import success icon,
1 `TeamCommissionDialog` notice. Each belongs to a separately deferred family, listed above.

#### Validation

| Check | Result |
|---|---|
| `npm run typecheck` | **exit 0** |
| `npm run lint` | **exit 0** — 2 pre-existing warnings (`react-hooks/incompatible-library`, TanStack Virtual), untouched by this wave |
| `npm run test` | **791 passed / 47 files** — identical to the Wave 5 baseline |
| `npm run build` | **compiled successfully**, 31 static pages, full route table |
| `prettier --check` on every touched file | **passes** |
| Compiled selector audit | Measured against the build taken right after the graphical migration: **+4** — the four new foreground utilities · **−9** — the legacy amber, blue and red text utilities Product Data used plus their dark twins (7), and two emerald stroke utilities that only ever existed because a closed debt entry quoted them (2). Nothing else moved. The graphical wave added its own 11 utilities, each verified emitted and resolving to a token |
| Theme scopes | all four new tokens defined in `:root`, `.dark` and `.catalog-theme` |
| Live screenshots | **NOT PERFORMED — Docker/Supabase unavailable.** Validation was compiled CSS, resolved values, computed contrast and the test suite |

`prettier` flagged three files. Two — `TrendChart.tsx` and `SellerKpis.tsx` — were caused by this
wave: the shorter class strings let the JSX fold onto a single line. Both were formatted, and the
Tailwind class sorter reordered `h-full bg-data-paid`. The third, `TicketPaymentSummary.tsx`, is
**CRLF on disk and prettier-clean in content**; it fails identically at HEAD, so it was left alone
rather than rewritten wholesale.

#### Deployment fingerprint audit (§18)

Four occurrences of the retired fingerprints `.fill-emerald-500/10` and `.stroke-blue-600`:

| Location | Classification | Action |
|---|---|---|
| `docs/HANDOFF.md` §1.a.0, dated 2026-08-25 | **HISTORICAL DEPLOYMENT SNAPSHOT** | preserved verbatim |
| `docs/PHASE_STATUS.md` §7 "Promoción a producción (2026-08-25)" | **HISTORICAL DEPLOYMENT SNAPSHOT** | preserved verbatim |
| `docs/TEST_RESULTS.md` "Verificación tras desplegar (2026-08-25)" | **HISTORICAL DEPLOYMENT SNAPSHOT** | preserved verbatim |
| This handoff §7, "Chart colours" debt entry | living debt, not a snapshot | updated — the debt is closed |

**No active deployment verification workflow is broken.** `scripts/verify-remote.ts` does not inspect
CSS at all, and `RUNBOOK.md` / `DEPLOYMENT.md` reference `npm run verify:remote`, never a fingerprint
list. The three snapshots are dated past-tense records of what was served on 2026-08-25.

**Final classification (approved 2026-09-06): HISTORICAL DEPLOYMENT SNAPSHOT.** Intentionally
preserved; the fingerprint no longer represents current CSS; **no active operational dependency**.
This is deliberately *not* carried as active documentation debt — the audit proved no runbook, no
`verify-remote` workflow and no deployment script reads it. Should a workflow that genuinely depends
on a fingerprint appear later, it can be reclassified then.

The following are recorded **as reference only**, for whoever next writes a deploy check by hand.
Both are present in the current build and generated by exactly one source file each:

* `.fill-data-paid\/10` — only `TrendChart.tsx`
* `.stroke-data-partial` — only `tones.ts`

No docs-only correction is required, and none was made: rewriting a dated snapshot would destroy
evidence of what was actually served on 2026-08-25.

**Remaining Wave 6 debt: none for Product Data.** What remains is owned elsewhere: the Progress family
(`CollectionSummaryCard`, `CommissionCard`, `BulkTicketCreator`), `RecentActivityCard`'s record state,
and the **Alert/Notice component gap**, which is the next prerequisite and is audited in §10.21.

---

### 10.21 WAVE 6.5A — NOTICE AUDIT & CONTRACT (2026-09-06 · **COMPLETED AND APPROVED** · commit in §11)

Audit and design contract. Wave 6 is the approved baseline at
**`2d8e4ac989f2180d29dd30cb89659e24ad9f2267`**, and none of its decisions is reopened here.

#### The four verified consumers

| | 1 · `owner/dashboard` | 2 · `seller/clients/[clientId]` | 3 · `seller/team/[sellerId]` | 4 · `PaymentForm` |
|---|---|---|---|---|
| **Semantic purpose** | work is waiting, and it is actionable | a condition that constrains the whole screen | a temporary account state, and what you can still do meanwhile | live validation of the allocation |
| **Approved tone** | **Warning** | **Neutral** | **Info** | **Success ↔ Warning** |
| **Title** | no | no | no | no |
| **Body** | yes, one sentence with a count | yes, two sentences (D-113) | yes, two sentences | yes, one sentence, swaps with state |
| **Icon** | yes | no | no | yes, swaps with state |
| **Action** | yes — a link button to the filtered list | no | no | no (the submit buttons are siblings) |
| **Dismissible** | no | no | no | no |
| **Lifetime** | conditional, disappears at zero | conditional on `archived` | conditional on `activatedAt === null` | **always rendered**, only the tone changes |
| **Placement** | inline, page level | inline, page level | inline, page level | inline, form level, at the foot |
| **Light / Dark** | both | both | both | both |
| **Catalog** | not reachable | not reachable | not reachable | not reachable |
| **Accessibility today** | no role, no live region | none | none | **`aria-live="polite"`** |

Tone is decided by **meaning, never by the wording** and never by the amber production happened to
use. Consumer 3 is a normal waiting state, so it is **Info, not Warning**.

#### The component is called NOTICE

Not "Alert". Every verified consumer is an **inline contextual notice**, and none requires assertive
alert semantics. shadcn's `Alert` may serve as a structural reference, but **Rifas owns the
contract** — its semantics are not inherited.

`alert-dialog.tsx` (modal decision) and `sonner` (transient toast) already exist and are untouched.

#### Approved public contract

```
Notice
  tone      'info' | 'success' | 'warning' | 'neutral'   required
  children  body content                                  required
  icon?     ReactNode                                     optional
  action?   ReactNode                                     optional
  live?     boolean, default false                        optional
```

Deliberately absent, and not to be added without current product evidence: **error tone, title,
dismissible, size, floating, compact, severity** and arbitrary visual variants.

**Error is not part of Notice v1.** No verified consumer needs it, and inline failures already use an
established, different pattern — `role="alert"` with destructive text, in `PaymentForm`, `ClientForm`,
`RaffleForm`, `LoginForm`, `ResetPasswordForm`, `EditPaymentDialog` and `TeamCommissionDialog`. If a
recurring inline error notice appears later, the component can be extended then.

#### Token reuse — validated, no new family needed

Notice reuses `status/<tone>/surface`, `/border`, `/text` and `/icon`. Measured on the real
composition, not inferred from Badge:

| Tone | Light text/surface | Dark text/surface | Light icon/surface | Dark icon/surface |
|---|---|---|---|---|
| Info | **8.24** | **10.44** | 5.09 | 6.37 |
| Success | **8.47** | **11.87** | 4.72 | 7.83 |
| Warning | **8.13** | **12.05** | 4.52 | 8.71 |
| Neutral | **14.46** | **13.34** | 6.15 | 5.56 |

Every tone clears 4.5:1 for normal text by a wide margin, in both themes. **No `notice/*` token family
is created**, and none is needed.

**On the boundary.** The border-against-page ratios sit between 1.45 and 2.79. That is **not a
regression and not a gate failure**: the ratios are *identical* to what production ships today,
because the same ramp steps are involved — warning 1.45 today and 1.45 with tokens, success 1.52 and
1.52, Dark 2.79 and 2.79 — and Info actually improves, 1.45 → 1.67. A Notice is a static,
non-interactive panel whose meaning is carried entirely by its text; its border is not the only cue
that identifies a control, so WCAG 1.4.11 does not bind it. Recorded openly rather than presented as
a pass.

#### Figma

`Notice` lives on page **`02 — Components`** at (16400, 8950), continuing the existing top-level row
after `Chart / Donut` — nothing was moved.

* Variant axis: **Tone** — Info · Success · Warning · Neutral (4 variants, no combinatorial explosion)
* Component properties: `Message` (text), `Show icon` (boolean, default **false**), `Icon`
  (instance-swap), `Show action` (boolean, default **false**), `Action label` (text)
* Icon and Action are **slots and properties, never variants**
* Live-region behaviour is documented in the component description as **ACCESSIBILITY METADATA /
  CODE BEHAVIOR**, not as a visual variant

Structure is exactly `optional icon → content → optional action`. No title region, no close button,
no elevation — it is an inline surface. Spacing, radius, border and typography come from existing
tokens; none was invented.

#### Accessibility contract

| Rule | Reason |
|---|---|
| No `role` and no `aria-live` by default | a notice rendered already-true on load is not an alert |
| `live` adds `aria-live="polite"` and nothing else | for content that changes in place |
| **Never `role="alert"`, never `aria-live="assertive"`** | assertive interrupts; reserved for the existing field-error pattern |
| `role` is **not** exposed as a prop | consumers cannot opt into alert semantics by accident |
| Icons are `aria-hidden` and optional | the meaning lives in the words, never in the icon or the tint |
| An action is a real focusable control | the block itself is never clickable |
| Reading order: icon → content → action | matches the visual order |
| No focus trap, no autofocus, no dismiss | it is not an overlay |

#### Firewall

`Notice` (persistent inline context) · `AlertDialog` (modal decision) · `Sonner` toast (transient
notification) · `StatusBadge` (compact entity state) are four separate patterns. Notice may share
`status/*` colour roles with StatusBadge and shares nothing else; **Badge is not stretched** to cover
this.

#### The pilot contradiction this closes

`seller/clients/[clientId]` is inside the approved **Clientes — Seller** pilot. Its archived-client
notice is painted amber (warning) while its own `StatusBadge` has been **Neutral since Wave 4.5B** —
the same fact told twice on one screen in two tones. Wave 6.5B resolves it: both become Neutral,
which is an **approved consistency fix**.

---

### 10.22 WAVE 6.5B — NOTICE COMPONENT & MIGRATION (2026-09-06 · **COMPLETED AND APPROVED** · commit in §11)

**5 production files: 1 new, 4 migrated.** Nothing else was touched.

| File | Change |
|---|---|
| `src/components/feedback/Notice.tsx` | **new** — the component, beside `ConfirmDialog` |
| `src/app/(protected)/owner/dashboard/page.tsx` | Warning, with icon and action |
| `src/app/(protected)/seller/clients/[clientId]/page.tsx` | **Neutral** — the pilot fix |
| `src/app/(protected)/seller/team/[sellerId]/page.tsx` | Info |
| `src/features/payments/components/PaymentForm.tsx` | Success ↔ Warning, `live` |

#### Final public API

```ts
type NoticeTone = 'info' | 'success' | 'warning' | 'neutral'

Notice({ tone, children, icon?, action?, live? })   // live defaults to false
```

`NoticeTone` is declared independently rather than derived from `StatusTone`, so the absence of an
error tone is a fact of the type, not an omission. **There is no `className` and no prop spread**: a
consumer cannot inject `role`, cannot opt into alert semantics and cannot override a tone.

#### Internal token architecture

Four tone maps, each one line, resolved from `status/<tone>/surface · border · text`, with a second
map for `status/<tone>/icon`. **No primitive palette class**, and no tone map duplicated in any
consumer — the same shape `StatusBadge` uses. **No `notice/*` token family was created**; the
composition measurement proved it unnecessary.

#### shadcn's `Alert` — inspected, and deliberately not adopted

`src/components/ui/alert.tsx` **does not exist**; the primitive was never installed and there is no
entry for it in `components.json`. shadcn's `Alert` sets **`role="alert"` on its root by default**,
which would announce every static notice assertively — the exact behaviour the contract forbids. The
component was therefore written against the Rifas contract rather than generated from the registry,
and no `role` is emitted anywhere. Nothing was inherited, so there was nothing to strip.

#### One contract question that surfaced during migration

`PaymentForm`'s notice carries a **trailing running total** — "Repartido $80.000 de $120.000" — at
the far right of the same row. Structurally that is the slot `action` occupies, but it is a **value,
not a control**, and §12 of the contract requires the action slot to hold a real focusable control.
Rather than misuse the slot or add a prop, the content wrapper was given `flex-1` so a consumer can
lay out its own row inside `children`. **The API is unchanged and the original layout is preserved
exactly.** Recorded here because it is the first evidence that a "trailing content" region exists
independently of an action; if a second consumer needs it, that is when the slot should be named.

#### Rendered contrast — measured in a browser, not inferred

Both themes, the real compiled CSS, the exact markup the component emits:

| Consumer | Tone | Light text | Dark text | Light icon | Dark icon |
|---|---|---|---|---|---|
| `owner/dashboard` | Warning | **8.13** | **12.05** | 4.52 | 8.71 |
| `seller/clients/[clientId]` | Neutral | **14.46** | **13.34** | — | — |
| `seller/team/[sellerId]` | Info | **8.24** | **10.44** | — | — |
| `PaymentForm` valid | Success | **8.47** | **11.87** | 4.72 | 7.83 |
| `PaymentForm` invalid | Warning | **8.13** | **12.05** | 4.52 | 8.71 |

**Worst text 8.13:1, worst icon 4.52:1. Every tone passes in both themes.** Icons are decorative and
`aria-hidden`, so the 4.52 figure is a courtesy, not a requirement. **Catalog: not reachable** — none
of the four consumers renders under `.catalog-theme`, verified against the route import graph, so no
Catalog composition was invented.

#### Responsive — verified at 375, 768 and 1360

| Width | Behaviour |
|---|---|
| **375** | Stacks: message on top, action on its own line beneath. The PaymentForm running total sits under the message, indented past the icon, exactly as before |
| **768** | Single row from the `sm` breakpoint: message left, action or trailing value right-aligned |
| **1360** | Single row, no overflow, no stretched line lengths |

No mobile and desktop variants exist, and **nothing is hidden at any width**. The notice wraps
naturally through `flex-wrap`.

#### Accessibility — verified in the DOM

| Check | Result |
|---|---|
| `role="alert"` anywhere on the page | **0** |
| `aria-live="assertive"` anywhere | **0** |
| `aria-live="polite"` | **only** the two PaymentForm states — the three static notices carry none |
| `role` on any notice | **null** on all five |
| Icons | `aria-hidden="true"` |
| Action | a real focusable `<button>`; the block itself has no `tabindex` and is not clickable |
| Reading order | icon → content → action |
| Focus trap / autofocus / dismiss | none |

#### The pilot contradiction is closed

`seller/clients/[clientId]` now renders a **Neutral** notice beside its **Neutral** `ClientStatusBadge`.
The screen no longer tells the same fact in two tones. **APPROVED CONSISTENCY FIX**, and it is a
deliberate visible change: the panel goes from amber to neutral.

#### Validation

| Check | Result |
|---|---|
| `npm run typecheck` | **exit 0** |
| `npm run lint` | **exit 0** — the same 2 pre-existing TanStack warnings |
| `npm run test` | **791 passed / 47 files**, unchanged |
| `npm run build` | **compiled successfully** |
| `prettier` | the new component and three of the four migrations are clean. `PaymentForm.tsx` reports one class-order nit **at a line this wave did not touch**, and it reports identically at HEAD — pre-existing, left alone |
| Compiled selectors | **+4** (`text-status-*-icon`) · **−3** (an emerald border and two padding utilities that only PaymentForm's old markup used). Nothing else moved |
| Live screenshots | **PERFORMED** — the dev server served the real compiled stylesheet and the exact component markup, driven at 375/768/1360 in Light and Dark. Supabase is still unavailable, so **no data-backed route was rendered**; the harness lived under a gitignored path and was deleted |

#### The border measurement — NON-BLOCKING COMPOSITION OBSERVATION

Notice borders measure between **1.45 and 2.79** against the surrounding surface, below 3:1. This is
recorded as a **non-blocking composition observation, not an accessibility failure**, and it does not
block anything.

The border is not the sole or necessary channel for the boundary, the tone or the meaning. The
component always carries visible message text, a tinted semantic surface, structural spacing and its
surrounding context. The ratios are also **identical to what production already shipped** — the same
ramp steps — so nothing regressed.

**The status token ramps must NOT be changed to force every Notice border above 3:1.** If some future
composition proves the border is genuinely needed to perceive the boundary, it gets re-evaluated then.

#### The trailing-value case — API deliberately NOT expanded

`PaymentForm` is the **only** consumer with a trailing value, and one consumer is not evidence for a
slot. It composes that value inside `children`, which the `flex-1` content wrapper already supports.
**A dedicated trailing-content slot requires a second meaningful recurring consumer**, and until one
appears the API stays at five props.

#### Remaining Notice debt

**Eleven** other tinted panels remain, untouched on purpose, each in a separately classified family:
5 dialog-level notices (`UserDialog`, `TeamCommissionDialog`, `BulkActionDialog`, `BulkAssignDialog`,
`TicketImportDialog`), 2 in `LotteryResultsCard`, 1 in `CommissionCard`, and 3 page-level ones
(`seller/dashboard`, `seller/tickets/[ticketId]`, and `seller/dashboard`'s `rounded-xl` outlier).
Their open question is the **second geometry cluster** — `rounded-md px-3 py-2` at dialog level
against the page-level `rounded-lg px-4 py-3` the component ships. That is what would decide whether
a `size` prop is justified, and it was deliberately not prejudged here.

---

### 10.23 WAVE 7 — PREFLIGHT ONLY (2026-09-06 · **NOT AUTHORIZED FOR EXECUTION**)

Read from Figma `04 — Design to Code` and the repository. **No production file was touched.**

#### Original scope, as written in Figma

> *Wave 7 · Patterns & pilot screen — compose the migrated pieces on one real screen. RISK MEDIUM —
> this is where integration problems finally surface, which is exactly why a pilot exists.*

The pilot is **CLIENTES in the Seller portal: the list page, the detail page and the create/edit
form** — chosen because it exercises six of eight waves across three routes while its only
destructive action, archiving, is reversible.

#### The actual routes, from the repository

| Route | File |
|---|---|
| List | `src/app/(protected)/seller/clients/page.tsx` |
| Detail | `src/app/(protected)/seller/clients/[clientId]/page.tsx` |
| Create | `src/app/(protected)/seller/clients/new/page.tsx` |
| Edit | `src/app/(protected)/seller/clients/[clientId]/edit/page.tsx` |

#### What the prior waves already satisfied

| Family | Status |
|---|---|
| Tokens, typography | **ALREADY SATISFIED** (Waves 1–2) |
| Controls — Button, Select, Switch, Label, Form | **ALREADY SATISFIED** (3A/3B) |
| Brand semantics | **ALREADY SATISFIED** (3B2) |
| Table, cells, pagination, empty state | **ALREADY SATISFIED** (Wave 4) |
| Page header, shell, navigation | **ALREADY SATISFIED** (Waves 4–5) |
| Status badges, including the archived client | **ALREADY SATISFIED** (4.5B) |
| Product Data — the ticket list inside the detail page | **ALREADY SATISFIED** (Wave 6) |
| Notice — the archived-client panel | **ALREADY SATISFIED** (6.5B, this turn) |
| **Hardcoded palette anywhere in the pilot tree** | **ZERO** — verified across all four routes and the twelve components they reach |
| Progress family debt | **OUTSIDE PILOT** — `CollectionSummaryCard`, `CommissionCard` and `BulkTicketCreator` are not reachable from any pilot route. The only progress bar reachable is `PaymentProgressBar`, which is Product Data and already migrated |
| Responsive List/Record | **ALREADY SATISFIED** structurally — `ClientsList` already switches table ↔ card list at `md` |

#### What genuinely remained — ALL THREE CLOSED BY WAVE 6.6 (refreshed 2026-09-06)

| Item | Status after Wave 6.6 | Evidence |
|---|---|---|
| **Control touch size** | **CLOSED** | `Input` and `Select` gained the `touch` size; the pilot's 4 inputs and 1 select adopt it. Measured 44px at 375 and 36px from 768. `Textarea` was already 64px |
| **`text/muted` contrast** | **CLOSED** | `--muted-foreground` now resolves to `text/muted`. The hovered-row case goes **4.35 → 7.17**; Dark and Catalog are inert |
| **`border/input`** | **CLOSED** | The border responsibility moved to the semantic role: **1.26 → 3.03** in Light, **1.34 → 3.12** in Dark. The overloaded fill responsibility stayed on the legacy variable, deliberately |

Nothing else is blocked. Global debt that the pilot does not reach — the Progress family, the eleven
remaining notices, `RecentActivityCard`, the Lottery presentation palette — **does not block it**,
and is not treated as a blocker merely for existing.

#### Expected Wave 7 shape

| | |
|---|---|
| **Routes** | 4 |
| **Components reached** | ~12, all already on semantic tokens |
| **Remaining visual changes** | control heights 36 → 44 on phone; `text/muted` darkens; `border/input` darkens |
| **Remaining semantic migrations** | none for colour — the three items above are token and sizing reconciliations, not adoptions |
| **Responsive work** | verification at 375, 768, 1360 and 1600 in three themes; the `md` table ↔ card switch is the fragile piece |
| **Accessibility work** | keyboard traversal with a visible ring on every control; contrast re-measured after the two token corrections |
| **Risk** | **MEDIUM** — unchanged. The composition is already done; what is left are two token changes with product-wide blast radius and one sizing change confined to controls |

**Is Wave 7 ready for execution? YES — the caveat is resolved.** The two cross-system token changes
were taken out of Wave 7 and executed as their own checkpoint (Wave 6.6, §10.24), exactly as the
Status and data-visualisation gaps were. Wave 7 is now purely route-level composition on a pilot that
reaches **zero hardcoded palette**, has every component on semantic tokens, and has no open
prerequisite of its own.

**Remaining Wave 7 practical scope**, re-checked against the repository after 6.6:

| Class | Content |
|---|---|
| **ALREADY SATISFIED** | tokens, typography, controls, brand, table and cells, pagination, empty state, page header, shell, navigation, Status badges, Product Data, Notice, muted-text contrast, input borders, touch controls |
| **SEMANTIC ADOPTION STILL REQUIRED** | none |
| **COMPOSITION CHANGE REQUIRED** | the pattern-level review the wave exists for: whether the four routes compose the migrated pieces the way `Pattern / List Page`, `Pattern / Detail Page` and `Pattern / Form` describe |
| **RESPONSIVE CHANGE REQUIRED** | unknown until verified — the `md` table ↔ card switch at 375, 768, 1360 and 1600 in three themes is the fragile piece |
| **ACCESSIBILITY CHANGE REQUIRED** | keyboard traversal with a visible ring on every control; the contrast work is already done |
| **NO-OP** | the archived-client notice, the ticket list inside the detail page, and every colour decision |

**Risk: LOW-to-MEDIUM**, down from MEDIUM. Every token and component change that could have surprised
the pilot has already landed and been measured; what remains is verification and, if the patterns
disagree with the routes, composition.

---

### 10.24 WAVE 6.6 — CROSS-SYSTEM ACCESSIBILITY & PILOT CONTROL RECONCILIATION (2026-09-06 · **COMPLETED AND APPROVED** · commit in §11)

**9 production files.** Three verified prerequisites, resolved without a single route-level override.

#### A · `text/muted` — the legacy variable IS overloaded, but not in conflict

`--muted-foreground` carries **four** responsibilities, not one:

| Job | Where |
|---|---|
| **A. Muted / secondary text and metadata** | ~300 of the occurrences |
| **B. Placeholder** | `input`, `textarea` (`placeholder:`), `select` (`data-[placeholder]:`) |
| **E. Icon tint** | dropdown and select item icons, `RowChevron`, avatar fallback, the `denied` and `offline` page icons |
| **E. Background tint** | `table.tsx` — the muted neutral at 20% as the hover fill of a selected row |

**C. Disabled text is NOT among them.** The system has its own `text/disabled` (`#8a8a8a`), and
disabled states in this codebase are expressed with `opacity-50` on the whole control — so nothing
that needs a disabled value is being served by this variable.

The decisive question was not "is it overloaded" but **"does any consumer need a different value?"**
None does: placeholder, icon tint and the row tint all want the same muted neutral, and the system
has exactly one. The overload is **nominal, not semantic** — so a compatibility-variable
reconciliation is the correct minimum, and repainting ~300 call sites individually would have been
far more invasive for the same result.

**Strategy: global compatibility-variable reconciliation.** `--muted-foreground` now resolves to
`--ds-text-muted` in all three scopes. Classified **ACCESSIBILITY CORRECTION** and
**CROSS-SYSTEM SEMANTIC RECONCILIATION** — deliberately *not* described as a pilot change.

| Scope | was | now | Effect |
|---|---|---|---|
| Light | `#737373` | **`#525252`** | the only value that moves |
| Dark | `#a1a1a1` | `#a1a1a1` | **INERT** — the legacy value already equalled the role |
| Catalog | `#b1afc0` | `#b1afc0` | **INERT** |

**Blast radius: 328 occurrences across 119 files** — 20 in the Owner portal, 12 in Seller, 2 in
Catalog, 243 in `features/`, 44 in `components/`. **Only the Light theme changes**, and only by
darkening muted text. Dark and Catalog are byte-identical, which is why a change this wide is safe.

| Surface | Light was → now | Dark | Catalog |
|---|---|---|---|
| `background/default` | 4.74 → **7.81** | 7.66 inert | 9.24 inert |
| `surface/card` | 4.74 → **7.81** | 6.94 inert | 8.29 inert |
| `surface/muted` (hovered rows) | **4.35 → 7.17** | 5.86 inert | 7.48 inert |

The hovered-row failure the preflight found is **closed**. Zero remaining failures; worst value 5.86.

**No route-specific token was created**, and none may be: there is no `pilot-muted`, `client-muted`
or `mobile-muted`, and the reconciliation is systemic by construction.

#### B · `border/input` — genuinely overloaded, so migrated BY CONSUMER

`--input` is **not** specific enough to redirect globally. It is both:

* the **control border** — `border-input`, in 6 primitives, and
* a **surface fill** — the same variable at 30% behind Input, Textarea, Select, Checkbox, Tabs and
  Button, at 50% on their dark hover, and at 80% as the Switch's unchecked track.

Those two want opposite things. The approved `border/input` is an opaque mid grey (`#666666` in Dark);
feeding that to a 30% fill would turn near-transparent dark fields into flat grey panels. So the
variable was **left alone** and only the border responsibility moved:

`border-input` → **`border-border-input`** in `button`, `checkbox`, `input`, `select`, `tabs`,
`textarea`. **Blast radius: 6 occurrences in 6 files**, all `components/ui` primitives — and the 9
fill usages are deliberately untouched. Catalog was already reconciled in Wave 4 and does not
move.

| Surface | Light was → now | Dark was → now | Catalog |
|---|---|---|---|
| `background/default` | 1.26 → **3.03** | 1.48 → **3.45** | 8.79 inert |
| `surface/card` | 1.26 → **3.03** | 1.34 → **3.12** | 7.89 inert |
| `surface/muted` | 1.16 → 2.78 | 1.13 → 2.64 | 7.12 inert |

The two `surface/muted` figures stay below 3:1 — but **no control is reachable on a muted surface**:
the pilot's filters and form render on the page background, and static inspection found no Input or
Select inside a muted container anywhere in the product. Recorded as measured-but-unreachable, not
claimed as a pass.

`focus/ring`, the `aria-invalid` destructive treatment and the disabled treatment are untouched and
remain distinct. **The normal border does not do the focus ring's job.**

#### C · Touch sizing — one architecture, extended, not a second mechanism

`Button` has had `touch` (`h-11 … sm:h-9`) since Wave 3A. That is the model the others now follow.

| Component | Result |
|---|---|
| **Input** | gains `size?: 'default' \| 'touch'`. `h-9` left the base string and moved into a size record. The native HTML `size` attribute — which counts characters — is **omitted from the type**, because width here is `w-full` and two different things called `size` read badly. Nothing passed `size` to `Input` before, so nothing broke |
| **Select** | its **existing** `size` API was extended: `'sm' \| 'default'` → `'sm' \| 'default' \| 'touch'`, with `data-[size=touch]:h-11 sm:data-[size=touch]:h-9`. No second mechanism was introduced |
| **Textarea** | **no change needed.** `min-h-16` is 64px, already well above the 44px floor. Adding a prop it does not need would have been invention, not capability |

**The default is unchanged everywhere.** `touch` is opt-in, so the blast radius of the capability
itself is zero, and Desktop Comfortable behaviour is preserved by construction.

#### D · Pilot adoption — scoped, 2 files

| Control | Action |
|---|---|
| `ClientFormFields` — 4 `Input`s (name, phone, email, alias) | `size="touch"` |
| `ClientFilters` — the seller `Select` | `size="touch"` |
| `ClientFormFields` — `Textarea` | none needed, already 64px |
| `ClientFilters` — `SearchInput` | **already touch-safe**, via its own `touchSize` prop, and the pilot already passes it |

No repository-wide touch migration was performed. **The capability is global; the adoption is scoped.**

#### Measured in a browser, at the real widths

| Width | Input default | Input touch | Select touch | Textarea |
|---|---|---|---|---|
| **375** | 36px | **44px** | **44px** | 64px |
| **768** | 36px | 36px | 36px | 64px |
| **1360** | 36px | 36px | 36px | 64px |

Rendered colours confirmed the tokens: muted text `rgb(82,82,82)` in Light and `rgb(161,161,161)` in
Dark; input border contrast **3.03** Light and **3.45** Dark. Viewport width is used here as a proxy
for pointer type, which is what the existing product already does — noted rather than assumed.

#### Intentional visual changes, and nothing else

| Change | Classification | Reach |
|---|---|---|
| Muted text darkens in Light | **APPROVED CROSS-SYSTEM TEXT CONTRAST CORRECTION** | global, Light only |
| Control borders darken in Light and Dark | **APPROVED CROSS-SYSTEM INPUT-BORDER CORRECTION** | 6 primitives |
| 4 inputs and 1 select become 44px under `sm` | **APPROVED PILOT TOUCH-SIZE ADOPTION** | pilot only |

No other family changed. The compiled selector delta is **+3 / −1**: `border-border-input` and its
dark variant appear, the responsive touch rule appears, and the old dark border utility disappears.
Nothing
else moved.

#### Validation

| Check | Result |
|---|---|
| `npm run verify` | **exit 0** — typecheck 0, lint 0 errors (same 2 pre-existing warnings), **791 tests / 47 files**, build compiled |
| `prettier` | the two feature files are clean. The six `components/ui` primitives report whole-file objections that are **CRLF line endings only** — their content is prettier-clean and they report identically at HEAD |
| Live routes with data | **NOT POSSIBLE — Supabase unavailable.** Validation used the real compiled stylesheet in a browser harness, resolved token values, computed contrast, source inspection and the test suite. The harness lived under a gitignored path and was deleted |

#### Remaining Wave 6.6 debt

* **`SearchInput`'s `touchSize` prop** is an ad-hoc mechanism (`h-11 md:h-9`) predating the semantic
  size, and it breaks at `md` where the DS breaks at `sm`. Folding it into `size="touch"` would change
  the breakpoint for 3 call sites, which is a visual change this wave was not authorized to make.
* **`PaymentForm`'s local `TOUCH_FIELD`** constant (`h-12 … md:h-9`) is the same story at 48px.
* **`text/placeholder` and an icon-tint role do not exist** in the token contract. Placeholder and
  icon tint currently ride on `text/muted` because there is nowhere else for them to go. Recorded as
  a contract gap, not a defect.
* The two unreachable `surface/muted` border figures above.

**None of these blocks the Clientes Seller pilot.** The two ad-hoc touch mechanisms already meet the
44px floor on a phone — they differ only in where they collapse back — and the two missing roles are
contract gaps whose consumers currently resolve to the right value anyway.

---

### 10.25 WAVE 7 — PATTERNS & PILOT SCREEN · CLIENTES SELLER (2026-09-06 · **COMPLETED AND APPROVED · PILOT SUCCESSFUL** · commit in §11)

**4 production files, 4 composition changes, zero new CSS.** The pilot's job was to prove the system
composes — not to generate churn. Most of it was already right.

#### The routes

| Role | File |
|---|---|
| List | `src/app/(protected)/seller/clients/page.tsx` |
| Detail | `src/app/(protected)/seller/clients/[clientId]/page.tsx` |
| Create | `src/app/(protected)/seller/clients/new/page.tsx` |
| Edit | `src/app/(protected)/seller/clients/[clientId]/edit/page.tsx` |

#### List Page — 1 change

| Responsibility | Result |
|---|---|
| Page header, title, description, primary action | **ALREADY SATISFIED** — uses `PageHeader` with `inlineActions` + `compactAction` |
| Search and filters | **ALREADY SATISFIED** — `ClientFilters` |
| Data region, pagination | **ALREADY SATISFIED** — `ClientsList` + `DataTablePagination`, counted as "clientes" |
| Empty dataset vs no results | **ALREADY SATISFIED** — `hasFilters` drives title, description **and** the action: "Crear mi primer cliente" appears only when nothing is filtered |
| **Toolbar in the empty-dataset state** | **CHANGED** |

The Pattern is explicit: *"the toolbar DISAPPEARS in Sin datos — there is nothing to filter when
nothing exists — but stays in Sin resultados, because the user must be able to clear the filter that
hid everything."* Production rendered `ClientFilters` unconditionally, so a brand-new seller met a
search box above "Todavía no tienes clientes". It is now rendered when there are rows **or** filters
are set — which keeps it exactly where the contract requires it, in Sin resultados.
**APPROVED PATTERN COMPOSITION CORRECTION.**

#### Desktop table — NO-OP

Columns are Cliente · Teléfono · Vendedor · Boletas · Comprado · Pagado · Saldo · Estado, with
`ClientStatusBadge` in Estado and numeric columns already right-aligned and tabular. Real entity
semantics, nothing to redesign. **The table was not narrowed to resemble a mockup.**

#### Mobile list / record — NO-OP, with one finding

At 375 the card leads with the client's name as a `RowLink`, carries a `RowChevron` affordance, and
shows `Boletas` and `Saldo` as a stat pair. Identity is immediate, the record opens, critical
metadata survives, secondary metadata is demoted, and there is no horizontal scroll. **Satisfies the
Pattern.**

**APPROVED RESPONSIVE REPRESENTATION DIFFERENCE.** The desktop table uses `ClientStatusBadge`
(Neutral); the mobile card writes "Archivado" as muted text. Approved 2026-09-06 as a responsive
density decision, not debt. The requirements it must keep meeting: the state label stays **visible**,
it is **never colour alone**, and it is understandable without having seen the desktop
representation — all three hold. **A StatusBadge must not be added to the mobile card for visual
symmetry**; it would grow every card on the most constrained surface to restate a fact already there.

#### Detail Page — 1 change, 1 conflict reported

| Responsibility | Result |
|---|---|
| Back, identity, status beside the title, compact action | **ALREADY SATISFIED** — `backHref`, `title`, `titleBadge`, `compactAction` |
| Notice for the archived state | **ALREADY SATISFIED** (Wave 6.5B), Neutral, directly under the header |
| Record's own facts, related data | present, but see the conflict below |
| **Route-local control heights** | **CHANGED** |

The three header buttons carried `h-11 … sm:h-9` as raw classes — a route-local restatement of a
capability `Button` has had since Wave 3A. They now use `size="touch"`, and `ClientArchiveButton`
gained a `size` passthrough so the route no longer expresses a control height at all. The width and
`grow` classes stay: those are layout, not control size.
**APPROVED ACCESSIBILITY COMPOSITION CORRECTION**, and it removes the last control override in the
pilot routes.

**CONFLICT REPORTED — card density contradicts a recorded product decision.** The Detail Page Pattern
says *"NOT OVER-CARDED. Exactly ONE container, around the record's own facts… wrapping a table in a
card would be a box inside a box."* The shipped page has **seven** card containers: `ClientInfoCard`
(one), `ClientTotals` (four `KpiCard`s) and two `TableSection`s.

`TableSection` is **D-113**, an accepted decision whose own docstring records the evidence: without
it, *"dos tablas seguidas con un `h2` suelto encima se leen como una sola lista larga."*

**RESOLVED 2026-09-06 — the contract wording was wrong, not the code.** D-113 stands, unrevisited,
and **no wrapper was added** to the client detail. The Pattern said *"exactly ONE container"*, which
conflated **page-level composition** with **semantic subcontainers**; taken literally it would have
demanded a single box around an entire record page to satisfy a documentation artifact. The contract
now reads **ONE PRIMARY PAGE COMPOSITION**: avoid generic card-per-section fragmentation, but allow
semantic subcontainers that carry a distinct component responsibility, group meaningful data, or
solve a verified usability problem. Metric/KPI cards, `TableSection` and `Notice` are first-class
Design System compositions and are **not counted** against fragmentation. Client detail is accepted
exactly as it stands, and `KpiCard` was neither flattened nor restyled.

The D-113 rule is now recorded in the Pattern itself: *adjacent related tables may remain in separate
`TableSection` containers when their boundaries and headings are what stop them reading as one
continuous list.* That is specific and evidence-backed — **not** permission for unlimited cards.

#### Create / Edit — NO-OP, and the shared-composition question answered

Both routes are thin wrappers around the **same** `ClientForm`; they differ only in the page header
and whether a `client` prop is passed. **There is no duplicated layout at all** — the abstraction is
already correct, so nothing was consolidated and no refactor was performed.

#### Form — 2 changes

| Requirement | Result |
|---|---|
| Single constrained column, `max-w-xl`, 20px rhythm | **ALREADY SATISFIED** — `max-w-xl space-y-5` is exactly the contract |
| Inline actions, submit then cancel, no sticky bar | **ALREADY SATISFIED** |
| Validation said twice, never colour alone | **ALREADY SATISFIED** — form-level banner with `role="alert"`, plus per-field `FormMessage`, `aria-invalid` on the control and an error-coloured label |
| **Mobile actions full-width and 44px** | **CHANGED** |
| **Verb-specific progress label** | **CHANGED** |

The actions were default-size and auto-width, so on a phone the submit button was a small target at
the end of a scrolled form. Both now use `size="touch"` with `w-full sm:w-auto`: 44px and full width
below `sm`, unchanged from `sm` up. And the submit label said "Guardando…" for both verbs; creating a
client now says **"Creando…"**, matching the contract and the rest of the product.
**APPROVED PATTERN + ACCESSIBILITY COMPOSITION CORRECTIONS.**

#### Page Header and action hierarchy — NO-OP

No custom route header exists; every route uses `PageHeader`'s own API and only the capabilities it
needs — list uses `inlineActions` + `compactAction`, detail adds `backHref`, `titleBadge` and
`actions`, create uses title + description, edit uses title + `backHref`. Hierarchy is unambiguous on
every screen: exactly **one** filled primary action, secondaries as outlines. Nothing critical is
hidden to shorten the header.

#### Status / Notice / metadata hierarchy — NO-OP

Each component does its own job and they are not stacked for decoration: `ClientStatusBadge` states
the entity's state beside the title, the `Notice` explains what that state *implies* for the screen,
muted text carries supporting metadata, and Product Data stays quantitative. The badge-plus-notice
pair on an archived client is **not** redundant — one names the state, the other says the client will
not appear when assigning tickets and that history is kept. Different purposes, so both stay.

#### Responsive — measured, not asserted

| Width | Result |
|---|---|
| **375** | Form actions **44px, full width**; detail primary action 44px full width; the two secondaries share a row at 44px; "Creando…" renders |
| **768** | All actions return to **36px, auto width**; the table ↔ card switch is at the existing `md` strategy and was not touched |
| **1360** | 36px, auto width, no overflow |
| **1600** | Identical to 1360 |

**No new breakpoint was invented for Clientes**, and the verified `md` table/card strategy is
untouched.

#### Themes

Light and Dark both verified on the changed compositions — brand green, outline borders and text all
resolve through tokens in both. **Catalog was not fabricated**: Clientes is a Seller workflow that
never renders under `.catalog-theme`. No shared component changed in this wave alters a Catalog
contract, since the only shared component touched is `ClientArchiveButton`, which is pilot-owned.

#### Keyboard, focus and form accessibility

DOM order matches visual order and submit precedes cancel. No non-interactive element is focusable,
there is no `tabindex="-1"` trap, and every action is a real control. Labels are associated through
`FormLabel`, errors through `FormMessage` and `aria-invalid`, and the invalid state carries a border
**and** a message, never colour alone. Spanish copy is unchanged — no validation text was invented.
Focus styling is untouched from the Wave 3A baseline; a programmatic harness cannot exercise
`:focus-visible`, so that was verified as a rule in the compiled CSS rather than by simulated focus.

#### Hardcoded palette gate

**ZERO across the entire pilot tree** — all four routes and the twelve components they reach.
Wave 7 introduced no primitive palette class.

#### Validation

| Check | Result |
|---|---|
| `npm run typecheck` · `lint` · `test` · `build` | **all pass** — 0 type errors, 0 lint errors (same 2 pre-existing warnings), **791 tests / 47 files**, build compiled |
| Compiled selectors, **clean build vs clean build** | **zero added, zero removed** — the composition changes reuse only utilities that already existed |
| **DATA-BACKED VISUAL QA** | **NOT PERFORMED · ENVIRONMENT UNAVAILABLE · NON-BLOCKING FOR DESIGN SYSTEM PILOT APPROVAL.** Supabase was unavailable, so the real data-backed routes were never rendered end to end. What was used instead: the compiled stylesheet, a browser presentation harness with the real component markup, source inspection, and the test and build suites. The harness lived under a gitignored path and was deleted. **Carried forward as QA evidence still required before broad release or promotion** — no production-data visual validation is being claimed |

> A note on an earlier measurement: `.collapse` appeared in one selector diff and was **not** a Wave 7
> change. Incremental builds had been reusing a stale scan cache; a clean rebuild of the committed
> Wave 6.6 state emits it too, from the pre-existing `--sidebar-width-collapsed` strings in
> `globals.css`. All Wave 7 figures above are clean-build comparisons.

#### PILOT VERDICT — SUCCESSFUL

| Criterion | Result |
|---|---|
| List Page Pattern | **PASS** |
| Detail Page Pattern | **PASS**, after the contract clarification above |
| Form Pattern | **PASS** |
| Desktop entity table | **PASS** |
| Mobile List / Record | **PASS** |
| Page Header composition | **PASS** |
| Status + Notice composition | **PASS** |
| Product Data composition | **PASS** |
| Semantic controls | **PASS** |
| Touch behaviour | **PASS** |
| Keyboard / focus audit | **PASS** |
| Hardcoded palette in the pilot | **ZERO** |
| Pilot-only semantic or token hacks | **ZERO** |
| **Core component or token defects exposed by composition** | **ZERO** |

#### Remaining pilot debt

* `DataTablePagination` keeps two `h-11 … md:h-8` overrides. It is a **shared** component and its
  desktop size is `h-8`, which `Button`'s `touch` (44 → 36) does not express — converting would change
  both the breakpoint and the desktop size globally. Not a defect; deferred.
* The archived-state representation split described above.
* `SearchInput`'s `touchSize` and `PaymentForm`'s `TOUCH_FIELD`, unchanged from Wave 6.6 and still
  non-blocking.

---

### 10.26 POST-PILOT ROLLOUT PREFLIGHT (2026-09-06 · **COMPLETED AND APPROVED** · commit in §11)

#### Approved post-pilot status

| | Status |
|---|---|
| **Clientes Seller pilot** | **COMPLETED AND APPROVED · SUCCESSFUL** |
| **Post-pilot rollout preflight** | **COMPLETED AND APPROVED** |
| Design System — **Core / Foundations** | **READY FOR ROLLOUT** |
| Design System — **Components** | **READY FOR ROLLOUT** |
| Pattern — **List Page** | **PROVEN** |
| Pattern — **Detail Page** | **PROVEN** |
| Pattern — **Form** | **PROVEN** |
| Pattern — **Search / Filters** | **PARTIALLY PROVEN** |
| Pattern — **Bulk Selection** | **NOT YET PROVEN** |
| Pattern — **Dashboard** | **NOT YET PROVEN** |
| **Product-wide screen adoption** | **EARLY / IN PROGRESS** |

**4 of 37 routes have undergone a Pattern-level audit.** The product is **not** fully migrated, and
nothing in this document should be read as saying otherwise.

#### Naming from here on

The seven-wave Design System migration is **finished**. Product-screen adoption does **not** continue
that numbering — there is no Wave 8. It runs as a separate sequence, **ROLLOUT R1, R2, …**, so that
Design System construction stays distinguishable from product screen adoption.

The audit that follows is unchanged from the approved preflight.

No production file was touched. Route inventory and classification come from the repository, not from
an earlier list.

#### Where the original plan stands

| | Status |
|---|---|
| **Waves 1–7, as originally approved** | **ALL COMPLETE.** Tokens · Typography · Core controls + brand · Data display & overlays · Navigation & shell · Data visualisation · Patterns & pilot screen |
| **Inserted reconciliation waves** | **ALL COMPLETE.** 3A/3B1/3B1b/3B2 (brand split) · 4.5A/4.5B (Status semantics) · 6.5A/6.5B (Notice) · 6.6 (cross-system accessibility and control sizing) |
| **Original responsibilities still unowned** | **None.** Every family named in the Phase 11 contract has an approved contract and a code implementation |
| **The pilot milestone** | **COMPLETE.** Clientes Seller passed every criterion, with zero Core defects exposed |
| **Product-wide screen adoption** | **NOT complete** — and it was never part of the original plan. 4 of 37 routes have been through a Pattern audit |

**The Design System is mature; the product is not yet migrated.** Those are different statuses and
this document keeps them apart.

#### Remaining Core / component debt, by actual reach

| Debt | Reach | Blocks |
|---|---|---|
| Notice compact geometry | **6 recurring consumers** (see below) | the Tickets and People groups |
| Progress family — `CollectionSummaryCard` | `owner/dashboard` only | Dashboards |
| Progress family — `CommissionCard` | `seller/team/[sellerId]` only | People |
| Progress family — `BulkTicketCreator` | `owner/tickets/bulk` only | Tickets |
| `RecentActivityCard` record state | `seller/dashboard` only | Dashboards |
| Lottery presentation palette — **12 occurrences in one file** | `LotteryResultsCard`, reached from both dashboards | Dashboards |
| `ClearanceReceipt*` palette — 3 files | ticket detail | Tickets |
| `SearchInput` `touchSize`, `PaymentForm` `TOUCH_FIELD`, `DataTablePagination` sizing | shared | nothing — all meet the 44px floor already |
| Legacy `muted-foreground` non-text jobs (placeholder, icon tint, one row tint) | global | nothing — resolves to the right value |

**Total remaining hardcoded palette: 27 occurrences in 15 files**, and **12 of them are one file**.

#### NOTICE CONTRACT EXTENSION CANDIDATE — evidence found

Six consumers use the compact geometry (`rounded-md px-3 py-2`), all inside dialogs or cards:
`CommissionCard`, `TeamCommissionDialog`, `TicketImportDialog`, `BulkActionDialog`,
`BulkAssignDialog`, `UserDialog`. Two more use the page geometry the component already ships
(`seller/dashboard`, which is a `rounded-xl` outlier, and `seller/tickets/[ticketId]`).

Six recurring consumers is well past the two the contract requires, so a **compact Notice geometry is
justified**. It is **not implemented here**. Two `LotteryResultsCard` panels use a hybrid
(`rounded-lg px-3 py-2`) and should be judged with that file's other work, not counted as evidence
for the compact size.

#### Pattern maturity after one pilot

| Pattern | Status | Evidence |
|---|---|---|
| **List Page** | **PROVEN IN PILOT** | `seller/clients`, including both empty states and the toolbar rule |
| **Detail Page** | **PROVEN IN PILOT** | `seller/clients/[clientId]`, and it is what forced the contract clarification |
| **Form** | **PROVEN IN PILOT** | create and edit, sharing one form |
| **Search / Filters** | **PARTIALLY PROVEN** | exercised through `ClientFilters`, but never with a second filter shape or a seller selector under load |
| **Bulk Selection** | **NOT YET PROVEN** | no pilot route reaches it; it lives in Tickets |
| **Dashboard composition** | **NOT YET PROVEN** | no Pattern contract exists for it, and no pilot touched one |

#### Proposed migration groups

| # | Group | Routes | Primary Pattern | DS coverage | Blockers | Prerequisite | Risk |
|---|---|---|---|---|---|---|---|
| **1** | **Clientes Owner** | `owner/clients`, `owner/clients/[clientId]` | List + Detail | **A — already mostly migrated**; uses the pilot's own components, zero palette | none | none | **LOW** |
| **2** | **Raffles** | `owner/raffles`, `[raffleId]`, `[raffleId]/edit`, `new` | List + Detail + Form | **A/C** — zero palette, composition unverified | none | none | **LOW** |
| **3** | **People** | `owner/sellers`, `[sellerId]`, `owner/users`, `seller/team`, `[sellerId]` | List + Detail | **B/C** | `UserDialog`, `TeamCommissionDialog` compact notices; `CommissionCard` progress | Notice compact geometry; a Progress decision | **MEDIUM** |
| **4** | **Payments** | `owner/payments`, `seller/payments`, `seller/payments/new` | List + Form | **B/C** | `PaymentDetailDialog` palette; `PaymentForm` `TOUCH_FIELD` | none hard | **MEDIUM** |
| **5** | **Tickets / Boletas** | `seller/tickets`, `[ticketId]`, `new`, `owner/tickets`, `[ticketId]`, `new`, `bulk` | List + Detail + Form + **Bulk Selection** + import | **B/C/D** | `ClearanceReceipt*` ×3, bulk dialogs ×2, import dialog ×2, ticket-detail notice, `BulkTicketCreator` progress | Notice compact geometry; Progress; **Bulk Selection is unproven** | **HIGH** |
| **6** | **Reports** | `owner/reports`, `seller/reports` | Other / data-dense | **A/C** — no palette found | none | none | **LOW-MEDIUM** |
| **7** | **Dashboards + Lottery** | `owner/dashboard`, `seller/dashboard` | **D — no Dashboard Pattern exists** | **D/E** | Lottery palette ×13, `RecentActivityCard` state, `CollectionSummaryCard` progress, `seller/dashboard` notice | a Dashboard Pattern contract; Progress; a semantic decision for record state; a Lottery presentation decision | **HIGH** |
| **8** | **Account / Auth / Utility** | `account/password`, `login`, `forgot-password`, `reset-password`, `denied`, `offline`, root | Form + Focused | **A** — no palette | none | none | **LOW** |
| **9** | **Catálogo público** | `(catalogo)/catalogo/[slug]` | Other — public | **F — outside current scope** | its own theme, already reconciled in Wave 4 | none | **N/A** |

#### Recommended order, and why

**1 · Clientes Owner — first, and it is not close.** It renders the **same components the pilot just
proved**, carries zero palette, and I verified two concrete carry-overs: `owner/clients` renders
`ClientFilters` unconditionally with `hasFilters` already computed, so the pilot's one-line toolbar
correction applies **verbatim**; and `owner/clients/[clientId]` shows the archived badge but has **no
`Notice`**, where the Seller detail explains what archived means. That is a composition gap the pilot
already solved. Highest coverage per unit of risk, and it re-tests the pilot's own conclusions on a
second portal — which is exactly what a second group should do.

**No prerequisite wave is needed before it.** Recommending one purely because debt exists elsewhere
would violate the rule that a debt item blocks only what it actually reaches.

Then **2 · Raffles** and **8 · Account/Auth** (both clean, both cheap), then **6 · Reports**. **4 ·
Payments** and **3 · People** next, with the **Notice compact geometry** decided immediately before
People, since People is the first group that actually reaches it. **5 · Tickets** and **7 ·
Dashboards** last: Tickets needs Bulk Selection proven and Progress decided, and Dashboards needs a
Pattern contract that does not exist yet plus three separate semantic decisions.

#### Post-pilot readiness

| Layer | Status |
|---|---|
| **Core / Foundations** | **READY.** Tokens in three scopes, brand active, typography, contrast reconciled, control sizing capable |
| **Components** | **READY**, with one justified extension pending (compact Notice) |
| **Patterns** | **PARTIALLY READY.** List, Detail and Form proven; Search/Filters partial; Bulk Selection and Dashboard unproven |
| **Product screen adoption** | **EARLY.** 4 of 37 routes audited; 27 palette occurrences remain in 15 files |
| **Known debt** | Bounded, catalogued and mapped to actual reach — none of it global |

**Verdict: the Design System is ready for rollout; the product is not yet migrated.**

---

### 10.27 ROLLOUT R1 — CLIENTES OWNER (2026-09-06 · **COMPLETED AND APPROVED** · commit in §11)

**1 production file, 1 change.** The preflight predicted a small migration; it was smaller than that.

#### Scope, confirmed against the repository

| Route | File |
|---|---|
| Owner Clients list | `src/app/(protected)/owner/clients/page.tsx` |
| Owner Client detail | `src/app/(protected)/owner/clients/[clientId]/page.tsx` |

**Exactly two routes.** There is no Owner create or edit route — clients are created from the seller
portal — so none was inferred into R1 and the preflight scope was correct.

#### Owner List — 1 change

| Responsibility | Result |
|---|---|
| Page header, title, description | **ALREADY SATISFIED** |
| Primary action | **LEGITIMATE ROLE DIFFERENCE — none exists, and none should.** The description says it outright: creation and editing happen in the seller portal |
| Search, filters, seller selector | **ALREADY SATISFIED** |
| Data region, pagination | **ALREADY SATISFIED** — `ClientsList` with `showSeller`, counted as "clientes" |
| Empty dataset vs no results | **ALREADY SATISFIED** — distinct titles *and* distinct descriptions, and the empty copy explains where clients come from rather than offering a create action Owner does not have |
| **Toolbar in the empty-dataset state** | **CHANGED** |

Owner had the identical defect the pilot found: `ClientFilters` rendered unconditionally while
`hasFilters` was already computed, so an organisation with no clients met a search box and a seller
selector above "Todavía no hay clientes". The same one-line correction applies — the toolbar is
rendered when there are rows **or** filters are set, so it survives in *Sin resultados* where it is
the only way back. **APPROVED PATTERN CARRY-OVER.**

#### Owner Detail — NO-OP, with the archived question answered

Back, identity, status badge, a role-appropriate action ("Ver vendedor"), the record's own facts and
two related `TableSection`s were all already correct under the clarified **ONE PRIMARY PAGE
COMPOSITION** contract. D-113 applies here exactly as it does on the seller detail. **Nothing was
changed.**

**The contextual Notice was deliberately NOT added**, and this is the evidence rather than a
preference:

* **Nothing Owner-side is gated on archiving.** The only behaviour in the entire product that reads
  the archived flag for a decision is the *seller* detail hiding its payment action
  (`canRegisterPayment = client.pendingAmount > 0 && !archived`). Voiding a payment is not
  archived-gated, and Owner has no assign or create action on this screen.
* **BR-C07 is scoped `C, S`** — *"Un cliente archivado no aparece en los selectores de asignación,
  pero su historial sigue visible."* The first half is a seller consequence; the second half is not
  asserted on this page because the page **shows** the history: totals, the tickets section and the
  payments section are all right there and populated.
* **The state is already stated twice** — the header `titleBadge` and the `Estado` cell inside
  `ClientInfoCard`. A Notice would be a third statement explaining a consequence that does not apply.

Per the contract, a Notice must carry a contextual responsibility; on this route it has none, so
adding one would be decorative duplication. **Reported as evidence, not built.**

#### Seller vs Owner differences, classified

| Difference | Class |
|---|---|
| Owner has no create action, on the page or in the empty state | **A · LEGITIMATE ROLE DIFFERENCE** |
| Owner list has a seller selector; Owner list and tables show a `Vendedor` column | **A** — the admin portal sees the whole organisation |
| Owner detail action is "Ver vendedor"; Seller's is "Registrar abono" plus edit and archive | **A** |
| Owner detail shows `sellerName` in the info card; tickets show raffle and seller | **A** |
| Owner payments table sets `canVoid`; Seller's does not | **A** — voiding is staff-only (BR-I10) |
| Owner detail has no archived Notice | **A**, on the evidence above — not a pattern inconsistency |
| Owner list toolbar rendered in the empty state | **B · PATTERN INCONSISTENCY** — the one thing corrected |

**No `C` (component inconsistency) and no `D` (product decision needed) were found.**

#### Shared component reuse — no fork

Owner renders the **same** `ClientFilters`, `ClientsList`, `ClientInfoCard`, `ClientTotals`,
`TableSection`, `ClientStatusBadge`, `PageHeader`, `EmptyState`, `DataTablePagination`,
`PaymentsTable` and `ClientTicketsList` as the pilot, differing only by props. Consequently it
inherited, with no work and no fork:

* the Wave 6.6 **touch-safe Select** — `ClientFilters` already passes `size="touch"`, so the Owner
  seller selector is 44px on a phone;
* the touch-safe search field;
* the `text/muted` contrast correction and the semantic input borders.

**Zero Core or shared components were changed in R1.**

#### Responsive

The one change is a conditional render, not a layout change, so nothing that Wave 7 measured moved.
What is genuinely new to Owner is the **seller selector in the filter row**, which the pilot never
exercised: it sits in a `min-w-56` (224px) block inside `flex flex-wrap`, which fits the ~343px
available at 375 with the archived switch wrapping to the next line. No overflow, and **no new
breakpoint was introduced**. 768, 1360 and 1600 are unchanged from the Wave 7 measurements of the
same components.

#### Accessibility

No control, focus behaviour or keyboard path was touched. The corrected state removes a control from
the DOM when it has nothing to act on, which shortens the tab path in the empty state and removes
nothing reachable in any other state — filters remain fully reachable in *Sin resultados*, which is
the state that needs them. The seller `Select` keeps its label association (`htmlFor` /
`id="client-seller"`) and its own keyboard behaviour, unchanged.

#### Validation

| Check | Result |
|---|---|
| `npm run typecheck` · `lint` · `test` · `build` | **all pass** — 0 errors, 0 lint errors (same 2 pre-existing warnings), **791 tests / 47 files** |
| Compiled selectors, clean build vs clean build | **zero added, zero removed** |
| `prettier` on the changed file | **clean** |
| **Hardcoded palette in the R1 route tree** | **ZERO** — gate holds |
| **DATA-BACKED VISUAL QA** | **NOT PERFORMED · ENVIRONMENT UNAVAILABLE.** Supabase remained down, so neither Owner route was rendered end to end. Validation was source inspection against the proven Pattern, the component-level measurements already taken in Waves 6.6 and 7, and the test and build suites. **No production-data visual validation is claimed** |

#### Result

| Criterion | Result |
|---|---|
| Owner list satisfies the List Page Pattern | **PASS** |
| Owner detail satisfies the Detail Page Pattern | **PASS** |
| Empty vs No results semantically correct | **PASS** |
| Archived contextual treatment semantically correct | **PASS** — badge only, on evidence |
| Seller-proven components reused without fork | **PASS** |
| Legitimate role differences preserved | **PASS** — six preserved, one corrected |
| Responsive composition | **PASS** |
| Keyboard / focus | **PASS** |
| Hardcoded route palette | **ZERO** |
| **Core changes** | **ZERO** |

**No new debt.** Nothing from the deferred list — Progress, the compact Notice geometry, Lottery
palette, `RecentActivityCard`, `SearchInput`, `PaymentForm`, `DataTablePagination` — is reachable
from either Owner Clientes route, and none was touched.

#### Next rollout group — preview only, NOT AUTHORIZED

**R2 · Raffles** — `owner/raffles`, `[raffleId]`, `[raffleId]/edit`, `new`.

The approved risk order still supports it, and R1 changed nothing that would alter that. It should
follow R1 because it is the next group with **zero reachable blockers** and it is the first to
exercise **List + Detail + Form together in one product area** — which is the whole Pattern set the
pilot proved, applied to an entity that is not a client. That tests transfer across domains, not just
across portals.

| Question | Answer |
|---|---|
| Reachable blockers | **None.** Zero hardcoded palette in `features/raffles` and the four routes |
| Prerequisite needed | **No** |
| Does the compact Notice geometry become relevant? | **No** — none of its six consumers is reachable from Raffles. It stays deferred until **People**, the first group that reaches it |
| Does Progress become relevant? | **No** — `CollectionSummaryCard`, `CommissionCard` and `BulkTicketCreator` reach Dashboards, People and Tickets respectively, not Raffles |

**People** is deliberately not recommended next: it is the first group that reaches the compact
Notice cluster and `CommissionCard`'s progress bar, so it needs two decisions taken first. Raffles
needs none, and clears four routes.

---

### 10.28 ROLLOUT R2 — RAFFLES (2026-09-06 · **COMPLETED AND APPROVED** · commit in §11)

**2 production files, 3 changes.** The first rollout into a **different product domain**, and the
patterns transferred.

#### Scope, confirmed against the repository

| Route | File |
|---|---|
| Raffles list | `src/app/(protected)/owner/raffles/page.tsx` |
| Raffle detail | `src/app/(protected)/owner/raffles/[raffleId]/page.tsx` |
| New raffle | `src/app/(protected)/owner/raffles/new/page.tsx` |
| Edit raffle | `src/app/(protected)/owner/raffles/[raffleId]/edit/page.tsx` |

Four routes, exactly as the inventory predicted.

#### Blocker gate — clean

| Item | Result |
|---|---|
| Hardcoded primitive palette | **ZERO** |
| Progress family — `CollectionSummaryCard`, `CommissionCard`, `BulkTicketCreator` | **NOT REACHABLE** |
| Compact Notice consumers | **NOT REACHABLE** |
| `LotteryResultsCard` and Lottery presentation | **NOT REACHABLE** |
| `RecentActivityCard` | **NOT REACHABLE** |
| `SearchInput` ad-hoc touch behaviour | **NOT REACHABLE** — the list has no search |
| `PaymentProgressBar`, `TOUCH_FIELD` | **NOT REACHABLE** |
| Local control-size overrides | **ZERO** |

**No blocker, and no prerequisite.** The raffle/lottery separation holds in code: the Raffles
workflow reaches no Lottery presentation component, so none of that debt was pulled in under this
label.

#### List — NO-OP, and the most interesting finding of R2

| Responsibility | Result |
|---|---|
| Page header, description, primary action ("Nueva rifa") | **ALREADY SATISFIED** |
| **Toolbar** | **NOT APPLICABLE — and that is correct** |
| **Pagination** | **NOT APPLICABLE — and that is correct** |
| Data region, status, row navigation | **ALREADY SATISFIED** — `RafflesTable` on `DataTable`, `RaffleStatusBadge`, `rowHref` |
| Empty dataset | **ALREADY SATISFIED** — one state, with "Crear la primera rifa" |
| Mobile representation | **ALREADY SATISFIED** — priority columns |

**Raffles has no toolbar and no pagination because the domain has neither to offer.**
`listRaffleSummaries()` takes no pagination arguments and returns every row: an organisation holds a
handful of raffles, not hundreds. With nothing to filter there is no filter bar, and **with no
filters there is no "Sin resultados" state to design** — only "Sin datos", which the page already
handles with the right action.

That is **cross-domain evidence about the Pattern itself**: its regions are *responsibilities when
applicable*, not a fixed skeleton. The pilot's toolbar rule ("hide it in Sin datos") is the same
principle taken to its limit — Raffles simply never has one to hide. **The rule was not forced onto a
domain that does not need it**, which §8 explicitly allows.

The mobile strategy is the contract's other approved branch: `RafflesTable` marks Boletas, Asignadas
and Vigencia `hideOnMobile`, which `DataTable` renders as `hidden md:table-cell`. At 375 it shows
Código · Rifa · Estado · Precio · Acción, and the whole row is activatable. **Priority columns, not a
card list — and the contract permits exactly that** for tables assigned them.

#### Detail — 1 change

| Responsibility | Result |
|---|---|
| Back, identity, description | **ALREADY SATISFIED** |
| **Status beside the identity** | **CHANGED** |
| Actions | **ALREADY SATISFIED** — `actions` without `compactAction`, which the API documents as the right choice when no single action dominates; Owner Clientes does the same |
| Record's own facts | **ALREADY SATISFIED** — exactly **one** container, "Datos de la rifa" |
| Related data | **ALREADY SATISFIED** — two heading-plus-grid sections of `MetricCard`s, no card wrapped around a card |

The detail showed its state only as the second field inside the facts card. It now also carries
`titleBadge={<RaffleStatusBadge …>}`, where this Pattern puts status and where both client details
already had it. **It matters more here than on a client**: the header's own actions appear and
disappear with the state — a closed or cancelled raffle has no Edit button — so the state is what
explains the actions. The facts card keeps its Estado field, exactly as `ClientInfoCard` does.
**APPROVED PATTERN CARRY-OVER.**

This page is also the cleanest example so far of the clarified **ONE PRIMARY PAGE COMPOSITION**: one
facts container, then headings with metric grids. No card-per-section fragmentation, and nothing was
flattened to reduce a container count.

#### Create / Edit — 2 changes, both carry-overs

`new` and `[raffleId]/edit` are thin wrappers around the **same** `RaffleForm`, differing only in the
header and whether a `raffle` prop is passed. **Already shared — no consolidation was needed or
done**, which is the same conclusion the pilot reached and now holds in two domains.

`RaffleForm` had the **exact two defects Wave 7 fixed in `ClientForm`**:

* mobile actions were default-size and auto-width → now `size="touch"` with `w-full sm:w-auto`;
* the submit label said "Guardando…" for both verbs → creating a raffle now says **"Creando…"**.

**APPROVED PATTERN CARRY-OVER + ACCESSIBILITY COMPOSITION CORRECTION.** Two domains, same two
defects, same fix — that is the transferable finding.

Already satisfied: the form-level `role="alert"` banner, per-field `FormMessage`, inline actions with
submit before cancel, and no sticky bar.

**Width, deliberately not changed.** `RaffleForm` uses `max-w-2xl` where the contract records
`max-w-xl`. It was **not narrowed**: the form carries a two-up date row and a bordered switch block,
and the normative requirement is a single constrained column rather than a specific number. Recorded
as **A · legitimate domain difference**, and the Pattern note now reads `max-w-xl` as typical rather
than fixed.

#### Status

`RaffleStatusBadge` and the `draft · active · closed · cancelled` mapping were **used, not touched**.
No Status mapping was reopened, no local tone invented, and no entity state was found that the
approved architecture cannot express.

#### Responsive and accessibility

The three changes are one added header slot and one action row. Both compositions were **already
measured**: the form action row is byte-identical to the one Wave 7 measured at 375 / 768 / 1360 /
1600 (44px full width below `sm`, 36px auto above), and `PageHeader`'s heading is
`flex flex-wrap items-center` with `min-w-0` on the `h1` — written specifically so a long name pushes
the badge to the next line instead of squeezing it. The raffle header is the densest so far (title,
badge, Edit and one status action) and composes within that design. **Verified by source against
already-measured components; no new measurement is claimed for the raffle routes themselves.**

Accessibility: no control, focus path or keyboard behaviour was touched. The added badge is text
inside a `<span>` beside the `h1`, deliberately **not** inside it, so the heading's accessible name
stays the raffle name. Form labels, error associations and required semantics are unchanged, and the
invalid state still carries a border and a message rather than colour alone.

#### Validation

| Check | Result |
|---|---|
| `npm run typecheck` · `lint` · `test` · `build` | **all pass** — 0 errors, 0 lint errors (same 2 pre-existing warnings), **791 tests / 47 files** |
| Compiled selectors, clean build vs clean build | **zero added, zero removed** |
| `prettier` | clean. One objection was **mine** — the new submit-label ternary exceeded the 100-column width — and was formatted; the diff stayed at 17 insertions |
| **Hardcoded palette in the R2 tree, after the change** | **ZERO** |
| **Core components changed** | **ZERO** |
| **DATA-BACKED VISUAL QA** | **NOT PERFORMED · ENVIRONMENT UNAVAILABLE.** Supabase remained down; no raffle route was rendered end to end and no production-data visual validation is claimed |

#### Result

Every R2 success criterion passes: list, detail and both form routes satisfy their proven Patterns;
domain differences preserved; responsive and keyboard behaviour intact; palette zero; **Core changes
zero**; no route-specific token hack introduced; no unrelated debt pulled into scope.

#### New debt discovered — one observation, not a blocker

**In-row secondary actions are `size="sm"` (32px) product-wide.** `RafflesTable`'s "Ver" button and
`PaymentsTable`'s row action both use it, and **no** table anywhere uses `size="touch"` in a row. At
375 that is below the 44px floor — but the entire row is an activatable link of full row height, so
the compliant target exists and the button is a redundant affordance for the same destination.
Changing only Raffles would fork a product-wide pattern, so nothing was changed.

Carried forward as **TABLE ROW ACTION TOUCH-TARGET RECONCILIATION · CROSS-CUTTING TABLE INTERACTION
QUESTION**, non-blocking for R2 and R3 and explicitly not to be fixed in either. A future audit must
first separate the two cases before anything is resized:

* **A — the action duplicates row navigation** (both `RafflesTable` «Ver» and the row `rowHref` open
  the same record). Here the question is whether the small button is a redundant affordance at all.
* **B — the action performs a distinct secondary operation.** Here its own touch target has to be
  evaluated on its own terms, because no row target substitutes for it.

**Table buttons must not be enlarged globally before that distinction is audited.**

---

#### Next rollout group — preview only, NOT AUTHORIZED

The approved inventory was re-evaluated at current HEAD rather than assumed. Nothing R1 or R2 did
changes the ordering, and the two cleanest remaining groups were both re-audited:

| Candidate | Routes | Palette | Reachable debt |
|---|---|---|---|
| **Account / Auth / Utility** | **6** | **ZERO** | **none** |
| Reports | 2 | ZERO | only `DataTablePagination`, already compliant |

**R3 · ACCOUNT / AUTH / UTILITY** — `account/password`, `login`, `forgot-password`, `reset-password`,
`denied`, `offline`.

| Question | Answer |
|---|---|
| Product area | Authentication, account and utility screens |
| Primary Pattern | **Form**, plus focused/utility screens with no Pattern of their own |
| Reachable debt | **None** — zero palette, and no Progress, Notice, Lottery, `SearchInput` or Product Data component is reachable |
| Blockers | **None** |
| Prerequisite needed | **No** |
| Compact Notice relevant? | **No** — none of its six consumers is reachable |
| Progress relevant? | **No** — all three consumers reach other groups |
| Risk | **LOW** |

**Why it should follow R2:** it clears **six routes** at the lowest available risk while staying
inside the Form Pattern the pilot proved, and it is the first group to exercise those routes
**outside the application shell** — the `(public)` layout group has its own layout, so it tests
whether the Pattern holds without the sidebar, header and bottom navigation around it. That is real
new evidence rather than a fourth repetition of the same context.

`denied` and `offline` are focused/utility screens that no current Pattern covers; R3 should report
whether that is a genuine gap or correctly out of scope, without inventing a Pattern for two pages.

**Reports is the natural R4.** It is only two routes and equally clean, but it is data-dense and
matches no existing Pattern, so it is likely to surface a **Design System gap (class D)** rather than
a composition correction. Better tackled once the cheap coverage is banked.

**People remains deferred** behind the compact Notice decision and `CommissionCard`'s progress bar,
exactly as the preflight recorded — R1 and R2 gave no reason to move it earlier.

---

### 10.29 ROLLOUT R3 — ACCOUNT / AUTH / UTILITY (2026-09-06 · **COMPLETED AND APPROVED** · commit in §11)

**7 production files, 13 changes, zero Core changes.** The first rollout **outside the application
shell** — and the first with **real route visual QA**, because these screens render without database
data.

#### Scope, confirmed against the repository

| Route | File |
|---|---|
| Change password | `src/app/(protected)/account/password/page.tsx` |
| Login | `src/app/(public)/login/page.tsx` |
| Forgot password | `src/app/(public)/forgot-password/page.tsx` |
| Reset password | `src/app/(public)/reset-password/page.tsx` |
| Access denied | `src/app/denied/page.tsx` |
| Offline | `src/app/offline/page.tsx` |

Six routes, exactly as the inventory predicted.

#### Blocker gate — clean, with one thing the palette regex could not see

Zero hardcoded palette, zero local control overrides, and Progress, compact Notice consumers, Lottery
presentation, `RecentActivityCard`, `PaymentProgressBar` and `StatusBadge` are all **NOT REACHABLE**.

**But the gate found something a palette scan misses.** The login page painted its success message
with the **legacy `--success` / `--warning` token pair** recorded as debt in
§7 ("one definition must win"). Those are not primitive palette classes, so no palette regex would
ever have caught them. Login was the **only consumer in the entire product**.

It was not a blocker: the responsibility already has an approved owner in `status/success/*`, and the
fix was composition-level. See below.

#### Per-route result

| Route | Result |
|---|---|
| **Login** | **2 changes** — submit and both inputs to `touch`; the success message became a `Notice` |
| **Forgot password** | **2 changes** — submit and input to `touch` |
| **Reset password** | **2 changes** — submit and both inputs to `touch` |
| **Change password** | **2 changes** — submit to `touch` and full-width below `sm`; both inputs to `touch` |
| **Denied** | **1 change** — the recovery action to `touch` |
| **Offline** | **1 change** — `h-11 sm:h-9` replaced by the semantic `touch` size |

Every auth submit was **36px on a phone** while being the single most important target on its screen.
Unlike a table row action, there is no larger target behind it. `size="touch"` is the existing
capability, so no route-local height was added anywhere.
**APPROVED FORM PATTERN CARRY-OVER + ACCESSIBILITY COMPOSITION CORRECTION.**

`OfflineRetry` was already touch-safe but said so with a raw `h-11 sm:h-9`; it now says it with the
capability. Same rendered height, one less route-local override.

Already satisfied, untouched: every auth form already had verb-specific progress labels
("Ingresando…", "Enviando…", "Guardando…"), per-field `FormMessage`, label association and
`aria-invalid`. **No validation copy was invented and no authentication logic was touched.**

#### The legacy success token — closed by attrition

The login success message now uses **`Notice tone="success"`** with the copy unchanged. This is not
"every auth message becomes a Notice": it is an inline contextual message inside a larger composition
(the login card), sitting above the form and explaining why you are back here and what to do. The
page's **main** message is still its `CardTitle`, which was left alone.

Consequence, re-verified at the checkpoint: **`--success` / `--warning` have ZERO consumers
product-wide** — the grep returns nothing and both utilities are absent from the compiled bundle,
while the 8 variable definitions remain in place.

**Classified: DEAD COMPATIBILITY TOKENS · VERIFIED ZERO CONSUMERS · REMOVAL DEFERRED TO CLEANUP.**
They were **not deleted**: Core stays frozen during product rollout, and cleanup is not rollout scope.
This closes the §7 "one definition must win" entry — the question is now only when to remove them.

#### Auth shared composition — NO-OP

`(public)/layout.tsx` already provides the shared shell: centred, `min-h-svh`, `max-w-sm`,
safe-area-aware padding. Each of the three auth routes is a `Card` with
`CardHeader` / `CardTitle` / `CardDescription` / `CardContent`. **That is the shared composition, and
it already exists** — there is no duplicated layout and **no `AuthLayout` abstraction was created**.

`PageHeader` was correctly **not** forced onto any shell-less route. `account/password` does use it,
and should: it is an authenticated application page, not a focused auth screen.

#### Denied and Offline — NEW PATTERN CANDIDATE, deliberately not formalized

The two screens share an identical architecture, and — the part that matters — a genuine shared
**responsibility**:

```
min-h-svh, centred, text-center
  decorative icon (aria-hidden)
  h1  ·  the state
  p   ·  why, in one sentence
  exactly one recovery action
```

| | Denied | Offline |
|---|---|---|
| State reported | authorisation — authenticated but not permitted | connectivity / environment |
| Chosen by the user? | no | no |
| Recovery | "Ir a mi panel" | "Reintentar" |
| Level | application-level state reached by route | application-level, served by the service worker |
| Entity involved | none | none |

Both **interrupt an intended navigation to report a system state the user did not choose, explain it
in one sentence, and offer exactly one way out.** Neither is an entity, so neither is a
`StatusBadge`; neither is inline context inside a larger composition, so neither is a `Notice`.

**APPROVED AND FORMALIZED 2026-09-06 as `Pattern / Focused System State`** — see §10.30. Both
screens are recorded as **proven instances**, and their legitimate semantic differences are preserved:
**Offline is not repainted as an error**, and neither screen is forced onto a Status role merely
because it reports a system state.

This is **not** "Pattern / Error Page". They are not grouped because both look sparse — offline is not
an error, it is an environment state, and denied is an authorisation outcome. The evidence is shared
responsibility, and the two states are deliberately **not** mapped onto `status/error`.

#### Real route visual QA — performed

**This is the first rollout where the actual routes were rendered**, because auth and utility screens
need no database rows. Measured on the running dev server, not a harness:

| Route | 375 | 768 / 1600 |
|---|---|---|
| `/login?message=password_updated` | submit **44px** (293px wide), email **44px**, password **44px** | **36px**, card fixed at **384px** and not stretching at 1600 |
| `/forgot-password` | submit **44px**, input **44px**, back link present | 36px |
| `/denied` | action **44px**, `h1` "Acceso denegado", icon `aria-hidden`, 2 focusables | — |
| `/offline` | action **44px**, `h1` "Estás sin conexión", 2 focusables | — |

The `Notice` on the real login route: Light `#d0fae5` on `#004f3b` = **8.47:1**; Dark `#002c22` on
`#a4f4cf` = **11.87:1** — matching the Wave 6.5B measurements exactly, with **no `role` and no
`aria-live`**, which is correct for a message rendered already-true on load.

**Dark had to be forced by class**, not by the colour-scheme media query: this app themes by a `.dark`
class, so emulating `prefers-color-scheme` alone does not flip it. Worth recording for future QA.

> **A measurement of mine was wrong before it was right.** The Dark submit button first read 3.98:1,
> which would have been a Core defect. It was a parser artifact — the computed colour is
> `oklab(0.984998 …)` and my regex read the lightness `0.98` as a red channel. Resolved properly
> through a canvas, it is `rgb(250,250,250)` on `rgb(13,125,45)` = **5.04:1, passing**. **No Core
> defect exists**; the brand button is fine.

#### Accessibility

Icons on both utility screens are `aria-hidden`, each screen has a real `<h1>`, reading order is
icon → heading → explanation → action, and every screen's only interactive elements are genuine
controls — no focusable containers, no fake clickable cards, no autofocus added. Errors were **not**
mechanically converted to `role="alert"`: the existing behaviour was left as it is, because these
forms already associate errors to fields and the auth error is rendered on load rather than injected
mid-interaction.

`denied` remains prerendered without JavaScript, which its own comment documents as deliberate and
safe — its only interactive element is a link. **Adding `size="touch"` does not change that**: it is a
class, not a script.

#### Validation

| Check | Result |
|---|---|
| `npm run typecheck` · `lint` · `test` · `build` | **all pass** — 0 errors, 0 lint errors (same 2 pre-existing warnings), **791 tests / 47 files** |
| Compiled selectors, clean build vs clean build | **zero added · two removed** — the two legacy success utilities |
| **Hardcoded palette in the R3 tree** | **ZERO**, before and after |
| **Core components changed** | **ZERO** |
| `prettier` | the files I changed that are LF are clean. Four flagged files are **CRLF-only** objections — the repo-wide condition, verified by normalising `denied/page.tsx` and re-checking |
| **REAL ROUTE VISUAL QA** | **PERFORMED** on `/login`, `/forgot-password`, `/denied`, `/offline` at 375 / 768 / 1600, Light and Dark |
| Data-backed routes | `account/password` and `reset-password` need a session, so they were **not** rendered — source-verified only. No production-data validation is claimed for those two |

#### Result

Every R3 success criterion passes. **No new debt.** One recorded debt item moved from open to
provably dead, and one Pattern candidate was raised with evidence rather than invented.

---

#### Next rollout group — preview only, NOT AUTHORIZED

The inventory was re-audited at current HEAD rather than assumed. The three remaining candidates:

| Candidate | Routes | Palette | Reachable debt | Compact notices |
|---|---|---|---|---|
| **Reports** | **2** | **ZERO** | **none** | **0** |
| Payments | 3 | 1 (`PaymentDetailDialog`) | `TOUCH_FIELD` ×4 | 0 |
| People | 5 | 3 | `CommissionCard` progress | **3** |

**R4 · REPORTS** — `owner/reports`, `seller/reports`.

| Question | Answer |
|---|---|
| Product area | Reporting, both portals |
| Primary Pattern | **None of the three proven ones fits cleanly.** It is a data-dense, filter-driven read-only surface |
| Reachable debt | **None** — zero palette; only `DataTablePagination`, already compliant |
| Blockers | **None** |
| Prerequisite needed | **No** |
| Compact Notice relevant? | **No** — zero compact consumers reachable |
| Progress relevant? | **No** |
| **Design System gap likelihood** | **HIGH — and that is the point.** Reports is the first group likely to produce a **class D** finding rather than a composition correction |
| Risk | **LOW-MEDIUM** — low blast radius, but it may end in a Pattern decision rather than code |

**Why Reports next:** it is the last group with zero blockers, so it can run without any prerequisite,
and it is the one most likely to tell us whether the Pattern set is *complete* or missing a
data-dense reporting shape. Better to learn that on two clean routes than to discover it inside
Tickets or Dashboards, where it would be tangled with Progress, Bulk Selection and Lottery debt.

**Payments and People both now need a decision first.** People reaches the compact Notice cluster (3
consumers) and `CommissionCard`'s progress bar; Payments reaches `PaymentForm`'s `TOUCH_FIELD` and one
palette occurrence. Neither is blocked *by R3*, but both would pull a deferred decision into a route
rollout, which the rollout rules forbid.

---

### 10.30 PATTERN / FOCUSED SYSTEM STATE (2026-09-06 · **FORMALIZED AND APPROVED**)

A new Pattern, created from R3 evidence rather than from resemblance.

**Figma:** page `02 — Components`, at (17100, 8950), beside `Notice`. A single component with **no
variant axis**.

#### Responsibility

The screen **itself** reports a system state: an intended navigation or workflow cannot continue
because of a state the user did not deliberately choose. The screen explains that state and, where
one exists, offers the way out.

#### Contract

| Region | Status |
|---|---|
| Semantic heading carrying the state | **REQUIRED** |
| Supporting explanation | **REQUIRED** |
| Decorative icon | **OPTIONAL** |
| Primary recovery action | **ZERO OR ONE** — some system states have no way out from the screen itself |

Properties: `Heading`, `Explanation`, `Show icon`, `Icon`, `Show recovery action`, `Action label`.

**Deliberately absent**, and not to be added without real evidence: a secondary-action slot, a
toolbar, a filter area, size variants, dismiss behaviour, and `PageHeader` — this is a shell-less
screen, and `PageHeader` is an application-page composition.

#### No tone axis

There is **no Error / Warning / Info / Neutral variant.** `/offline` proves these states are not
universally errors: being offline is an environment condition, not a failure, and `/denied` is an
authorisation outcome. **The Pattern owns composition and responsibility, not a severity taxonomy**;
any semantic colour comes from the screen's own context.

#### Boundaries

| It is not | Because |
|---|---|
| **Notice** | a Notice is persistent inline context *inside* a larger composition; here the route itself is the message |
| **StatusBadge** | that names a compact **entity** state, and no entity is involved |
| **AlertDialog** | that is a modal decision |
| **Toast** | that is transient |

These contracts must not be reused merely because they can share a semantic colour.

#### Proven instances

| Screen | State | Recovery |
|---|---|---|
| `/denied` | authenticated but not permitted — an authorisation outcome | "Ir a mi panel" |
| `/offline` | no connectivity — an environment condition | "Reintentar" |

#### No code component yet

**`FocusedSystemState.tsx` was deliberately NOT created.** Both screens remain compositions of
existing primitives, and a reusable component needs evidence this Pattern does not yet have: repeated
markup causing divergence, meaningful shared behaviour, or a third recurring consumer.
**A Pattern is not a mandatory React abstraction.**

---

### 10.31 R4A — REPORTS PATTERN AUDIT (2026-09-06 · **COMPLETED AND APPROVED** · commit in §11)

Audit only. **No file under `owner/reports`, `seller/reports` or `features/reports` was modified.**

#### Scope and gate

| Route | File |
|---|---|
| Owner reports | `src/app/(protected)/owner/reports/page.tsx` |
| Seller reports | `src/app/(protected)/seller/reports/page.tsx` |

Two routes, five shared components (`ReportsView`, `ReportNav`, `ReportFilters`, `ReportTable`,
`ExportCsvButton`), 1 411 lines. **No further independent report screens exist.**

**Gate clean**: zero hardcoded palette, zero local control overrides, and Progress, Lottery,
`RecentActivityCard`, `PaymentProgressBar` and `TOUCH_FIELD` all NOT REACHABLE. The `Notice` hits the
scan reported are `truncationNotice()`, a CSV text helper in `export.ts` — **not the component**.

#### Responsibilities, from the code

Both routes render **the same `ReportsView`**, differing only by props: which report keys are offered,
which base paths links use, and whether the seller filter appears.

| | Owner | Seller |
|---|---|---|
| Question answered | how the whole organisation is performing | how *my* book is performing |
| Report catalogue | `OWNER_REPORT_KEYS`, opens on "Por vendedor" | `SELLER_REPORT_KEYS`, opens on "Ventas por fecha" |
| Seller filter | yes | **no** — a seller does not compare against colleagues (`CLAUDE.md` §24) |
| "Por vendedor" report | yes | no |
| Filters | raffle, seller, date range, method, status | same minus seller |
| Summary | 3–4 `MetricCard`s per report | same |
| Data region | `ReportTable`, horizontal overflow + `hideOnMobile` | same |
| Pagination | on 3 of the report bodies | same |
| Export | `ExportCsvButton` in the header | same |
| Mutating actions | **none** | **none** |

**Legitimate role differences**: the report catalogue and the absent seller filter. Both are product
decisions with a recorded reason, not inconsistencies. **Everything else is shared and consistent** —
there is no duplication between the two portals to reconcile.

#### Does `Pattern / List Page` own this? **No.**

The honest test is whether List Page fails *semantically*, not whether Reports contains a table.

| List Page | Reports |
|---|---|
| Manages and discovers **entities** | **Answers a question**; nothing here is an entity to manage |
| Toolbar optionally *narrows* a list | Filters are the **primary instrument** — changing the date range changes the question, not the view |
| Header action **creates** | Header action **exports** |
| Rows navigate to a detail (`rowHref`) | **No row navigation, no row actions, no CRUD** — strictly read-only |
| Data region is the content | The **summary metrics are the answer**; the table is its supporting evidence |
| No equivalent | **A report selector** — choosing *which* analysis to run |
| Mobile: card list or priority columns | **Horizontal overflow**, legitimately: comparison across columns is the point |

Two regions have **no List Page equivalent at all** — the analysis selector and the aggregate summary
— and the fundamental purpose differs. Forcing Reports into List Page would mean calling an
aggregate answer a "data region" and a question-scoping instrument a "toolbar".

**A new Pattern is justified.**

#### Proposed name: `Pattern / Report Page`

Chosen from the **product's own vocabulary**, not from analytics convention. The product calls this
surface "Reportes", each item a **reporte** (`REPORT_LABELS`), and the selector announces itself as
"Reportes disponibles". "Data Explorer" and "Analytics Page" would import terms this product does not
use, which the glossary discipline forbids — one term, one name.

#### Proposed minimal contract

| Region | Status | Evidence |
|---|---|---|
| Page context — title, description | **REQUIRED** | present on both routes |
| **Analysis selector** | **REQUIRED** | `ReportNav`; both routes; the pattern is meaningless without a choice of analysis |
| **Scope controls** — range and dimension filters | **REQUIRED** | always rendered, never optional, and they define the question |
| **Summary metrics** | **REQUIRED** | 3–4 per report body, on every report |
| **Tabular evidence region** | **REQUIRED** | `ReportTable` on every report |
| Export | **OPTIONAL** | present on both routes today, but a report without an export is still a report |
| Pagination | **OPTIONAL** | only 3 of the 6 report bodies paginate |
| No-data state | **REQUIRED as a state** | `EmptyState`, per report body, distinguishing "no rows" from "filters returned none" |
| Loading state | **REQUIRED as a state** | see the gap below |
| Error state | **NOT PART OF THE PATTERN** | no evidence; no `error.tsx` exists and none is demonstrated |
| Row actions, CRUD, primary create action | **NOT PART OF THE PATTERN** | read-only by nature |
| Charts | **NOT PART OF THE PATTERN** | no report body renders one; the dashboards do, and that is a different surface |

Deliberately **not** included merely because analytics products usually have them: saved views,
comparison periods, drill-down, column pickers, scheduled delivery. **None has Rifas evidence.**

#### Findings that R4B would act on

1. **No loading state exists.** There is no `loading.tsx`, no `error.tsx` and no `Suspense` boundary;
   the report bodies are async server components, so switching report or changing a date blocks the
   whole page with no feedback. `Pattern / List Page` has a `State=Cargando` variant and this surface
   has nothing equivalent. **The component exists** (`Table / Skeleton`) — this is a **Pattern
   responsibility gap**, not a component gap.
2. **`ExportCsvButton` is `size="sm"` (32px)** in the header actions. Unlike a table row action there
   is no larger target behind it, so the 44px floor applies as it did to the auth submits. A
   composition fix using the existing `touch` size — **not** a component gap.

#### Search / Filters maturity — R4 would raise it, but not to proven

Reports filters are **always present, primary, URL-reflected, applied immediately on change, and
scoped by date range** — evidence Clientes never produced, because there filters only narrow a list.
It would add: date-range filtering, multi-dimension filtering, and "filters as the instrument".

It would **not** add search evidence: **Reports has no free-text search at all**. So R4 moves the
filter half toward proven while the search half stays where Clientes and Tickets left it. Recommended
status after R4B: still **PARTIALLY PROVEN**, with the gap named precisely rather than closed.

#### Responsive — source audit only

Both routes require a session and live data, and **Supabase is unavailable**, so **no report route was
rendered**. What the source establishes:

| Region | Behaviour |
|---|---|
| Analysis selector | `flex overflow-x-auto` with `whitespace-nowrap` — scrolls horizontally on a phone rather than wrapping into a tall block |
| Filters | `grid gap-3 sm:grid-cols-2 lg:grid-cols-4` — 1 column at 375, 2 from `sm`, 4 from `lg` |
| Summary metrics | grid, stacking per report body |
| Table | `w-full overflow-x-auto rounded-lg border` **plus** `hideOnMobile` priority columns |

The table uses **both** horizontal overflow and column hiding. That is legitimate here and should be
stated in the contract: a report table compares values across columns, so **it must not be forced
into mobile cards** the way an entity list is. **No measurement at 375 / 768 / 1360 / 1600 is
claimed** — R4B must perform it against a seeded environment.

#### Accessibility — source audit

Already correct: `ReportTable` carries `<caption class="sr-only">` and `scope="col"`; `ReportNav` is a
real `<nav aria-label="Reportes disponibles">` with a `<ul>` and `aria-current="page"`; filter controls
have `Label` / `htmlFor` / `id` pairs; the selected report uses semantic brand tokens
(`navigation/selected`, `text/brand`, `border/brand`) rather than colour alone, since `aria-current`
carries the state.

Two responsibilities the contract should state, both unverified without rendering: that changing a
filter or report **announces** the new result set to a screen reader (there is no live region today),
and that focus behaves sensibly across a filter-driven navigation. **R4B must verify both.**

#### Gaps, separated

| Kind | Finding |
|---|---|
| **PATTERN GAP** | `Pattern / Report Page` does not exist — proposed above |
| **PATTERN GAP** | the loading responsibility for a filter-driven read-only surface |
| **COMPONENT GAP** | **none confirmed.** Every region composes from existing components |
| **COMPONENT CANDIDATE, not a gap** | `ReportNav` — a scrollable analysis selector with `aria-current`. **One consumer**, so it does not meet the evidence bar for a Design System component. Recorded, not proposed |

#### Proposed R4B — REPORTS MIGRATION (NOT AUTHORIZED)

| | |
|---|---|
| Routes | `owner/reports`, `seller/reports` — 2 |
| Expected production files | `ReportsView.tsx`, `ExportCsvButton.tsx`, and a new `loading.tsx` per route (~4) |
| Pattern responsibilities to adopt | the loading state; export button touch sizing |
| Shared components | none changed — Core stays frozen |
| Responsive work | **real measurement at all four widths**, which R4A could not do |
| Accessibility work | verify result-set announcement and focus across filter navigation |
| Visual changes | a skeleton where there is currently a blocking gap; a 44px export button on phones |
| Risk | **LOW-MEDIUM** — small blast radius, but it is the first group whose value is a **Pattern decision** rather than code |

**R4B is ready for approval once `Pattern / Report Page` is approved or rejected.** If it is rejected
and List Page is deemed sufficient, R4B shrinks to the two composition findings above.

#### Pattern maturity after R4A

| Pattern | Status |
|---|---|
| List Page | **PROVEN** — Clientes ×2 portals, Raffles |
| Detail Page | **PROVEN** — Clientes ×2 portals, Raffles |
| Form | **PROVEN** — Clientes, Raffles, four auth forms |
| **Focused System State** | **PROVEN** — `/denied`, `/offline` |
| Search / Filters | **PARTIALLY PROVEN** — filters exercised; free-text search still only in entity lists |
| **Report Page** | **PROPOSED — DEFINED, AWAITING IMPLEMENTATION EVIDENCE.** Audited against two real routes; **not proven**, because nothing has been built against the contract |
| Bulk Selection | **NOT YET PROVEN** — lives in Tickets |
| Dashboard | **NOT YET PROVEN** — no contract exists |

---

### 10.32 PATTERN / REPORT PAGE (2026-09-06 · **FORMALIZED AND APPROVED** · DEFINED, awaiting implementation evidence)

**Figma:** page `02 — Components`, at (17800, 8950), beside the other Patterns. **Deliberately a
contract document, not a page component** — a Pattern is not a component, and `Report Page` does not
imply a `ReportPage.tsx`.

#### Responsibility

Uses **analysis and scope controls to answer a business question**. The **aggregate is the answer**;
the detailed table is its **supporting evidence**. It is **not** primarily an entity-management
surface.

#### Contract

| Region | Status |
|---|---|
| Page context — title and report context | **REQUIRED** |
| **Analysis selector** — which report/question is being viewed | **REQUIRED** |
| **Scope controls** — date/range and the report filters | **REQUIRED** |
| **Summary metrics** — the aggregate answer | **REQUIRED** |
| **Tabular evidence** — the detail supporting that answer | **REQUIRED** |
| No-data state | **REQUIRED** |
| **Loading / pending state** | **REQUIRED** |
| Export | **OPTIONAL** — a supporting action, not what defines a Report Page |
| Pagination | **OPTIONAL** — only part of the catalogue uses it |

These are **responsibility contracts, not fixed pixel regions**, and an absent optional
responsibility **never reserves empty space**.

**Not part of v1**, for want of Rifas evidence: CRUD actions, entity row actions, charts, saved views,
comparison periods, drill-down, column picker, secondary analytics navigation, and a Pattern-level
error region.

#### The List Page boundary

List Page **discovers and manages entities**. Report Page **answers a question** through scope,
aggregate and evidence. **A table does not make a page a List Page.** Filters here are not auxiliary
discovery controls — they are the *instrument*: change the scope, change the question and the result.

#### No-data is not List Page empty

When a report returns nothing for the selected scope, the **analysis selector and scope controls
stay** — they are how the user reformulates the report. Only the evidence region shows the no-data
state, and its copy explains the absence **in the currently selected context**. The
"create your first…" semantics are never reused: a Report Page does not create the records it reports
on.

#### Loading is a responsibility, not a file

The user must get perceptible feedback whenever a result update is not immediate — first navigation,
switching analysis, changing the range, changing a filter, paginating. **Adding a route loading
boundary does not by itself discharge this**: the real transition mechanism must be audited per case.
Enough structure stays visible that the user still knows which report and which scope they chose, and
where the result will land. Existing Skeleton and Data Display capabilities only — **no new Core
loading component**.

#### Result-update accessibility

The requirement is that a **result change is perceivable** to assistive technology — **not** that
`aria-live` is always present. If navigation and focus already communicate the new state, that is
sufficient. If content updates silently, add the smallest announcement: a concise result summary with
`aria-live="polite"`. **Never** make the whole table a live region, and never `role="alert"` or
`assertive`.

#### Responsive principle

A report table compares values **across columns**, so it must not be forced into mobile cards the way
an entity list is. The approved strategy may combine `hideOnMobile` for lower-priority columns with
**horizontal overflow** for the comparison data. Horizontal scrolling is legitimate here.

#### Maturity

**PROVEN (R4B, 2026-09-06).** Both routes satisfy the contract. The evidence is recorded accurately:
**two real role contexts over one shared `ReportsView` implementation**, not two independent builds.

---

### 10.33 R4B — REPORTS MIGRATION (2026-09-06 · **COMPLETED AND APPROVED** · commit in §11)

**2 production files, 3 changes, zero Core changes.** The first group migrated against a Pattern that
was written for it.

| Route | File |
|---|---|
| Owner reports | `src/app/(protected)/owner/reports/page.tsx` — **unchanged** |
| Seller reports | `src/app/(protected)/seller/reports/page.tsx` — **unchanged** |

Both routes render one shared `ReportsView`; **the shared architecture was preserved and not forked**,
and the legitimate role differences stand untouched — Owner keeps the seller filter and the
"Por vendedor" report, Seller keeps neither, and neither was aligned to the other for symmetry.

#### The transition audit — why no `loading.tsx` was written

The Pattern says loading is a responsibility, not a file, so each transition was audited for its
**real mechanism** before anything was built:

| Transition | Mechanism | Feedback before | After |
|---|---|---|---|
| A · first navigation to Reports | route navigation | none | skeleton |
| B · switching analysis | `ReportNav` → plain `<Link>`, **no transition state at all** | **none** | skeleton |
| C · changing the date range | `ReportFilters` → `startTransition(router.push)` | controls disabled; **result region looked current** | skeleton |
| D · changing another filter | same as C | same | skeleton |
| E · pagination | `DataTablePagination` → `startTransition(router.push)` | same | skeleton |

**Four of the five are search-param changes on the same route**, where a `loading.tsx` would not fire
at all. A route file would have discharged case A and left B–E exactly as they were — which is
precisely the trap the Pattern warns about.

**What was built instead:** one `<Suspense>` boundary around the result region, keyed on the resolved
scope (`JSON.stringify(activeFilters)`), with a skeleton fallback. Changing the key remounts the
boundary, so **all five transitions** now show feedback. The key is built from the **resolved** scope
rather than the raw URL, so "today" and "no dates" do not count as two different scopes.

The header, the analysis selector and the scope controls sit **outside** the boundary and stay put:
the user keeps seeing which report they asked for and with what scope, and where the answer will
land. `ReportResultSkeleton` repeats the **shape** of a report body — a metric row, then the table —
built from the existing `Skeleton` primitive. **No new Core loading component was created.**

#### Result-update accessibility — what was actually tested

Verified from source, before changing anything: **three of the six report bodies already announce**
their result change, because `DataTablePagination` carries `aria-live="polite"` on its range line
("1–25 de 118 clientes" / "Nada para mostrar"). The other three — `SellersReport`,
`TicketStatusReport`, `RafflesReport` — have **no live region at all**, so changing scope updated them
silently. Switching analysis was silent in every case.

**Added:** one `sr-only` `aria-live="polite"` line **inside** the boundary, naming the report. Because
the boundary remounts on every scope change, it re-announces. It is a concise summary — **not the
table, never `role="alert"`, never `assertive"`** — and where a count exists, pagination still
supplies it.

**Validation status, recorded precisely:**

| | |
|---|---|
| **Structural accessibility validation** | **PASS** — which regions carry a live region, and which did not |
| **Real assistive-technology validation** | **NOT PERFORMED** — no screen reader or AT environment was available, and Supabase is down so the real routes cannot be reached |

**Classification: NON-BLOCKING FOR R4B APPROVAL · REQUIRED BEFORE BROAD RELEASE AND FINAL
ACCESSIBILITY QA.** No real screen-reader test is being claimed, and **no further code change was
made merely because that QA is still owed**. The polite announcement is accepted structurally.

**The two live regions were deliberately left as they are.** Three report bodies announce through
`DataTablePagination`, and the new line covers report and scope changes more generally. They are
**not** merged or removed on speculation: if a real AT pass later shows duplicate or noisy
announcements, that is when they get reconciled. Guessing now would trade a verified structure for an
unverified one.

#### Export action

`ExportCsvButton` was `size="sm"` — 32px, and unlike a table row action **there is no larger target
behind it**. It now uses the existing `touch` size: **44px on a phone, 36px from `sm`**, measured. No
route-local height class, and the CSV logic was not touched. **APPROVED TOUCH-TARGET CORRECTION.**

#### Everything else — NO-OP

The analysis selector, scope controls, summary metrics, tabular evidence, no-data states and
pagination were **already correct** against the contract and were not touched. Specifically: the
selector keeps its `<nav aria-label>` / `<ul>` / `aria-current="page"` navigation semantics and was
**not converted to tabs**; the table keeps `<caption class="sr-only">` and `scope="col"`; no-data
states keep the selector and scope controls on screen, and none borrows "create your first…"
semantics; pagination stays on only the three bodies that use it.

#### Responsive — PRESENTATIONAL HARNESS QA

**REAL ROUTE QA was NOT possible**: both routes need a session, and the only way to render one would
have been to add a path to `PUBLIC_PATHS` in `src/lib/supabase/proxy.ts` — production security logic,
which the rollout rules forbid touching. A **presentational harness** was used instead: the real
compiled stylesheet with the exact markup and class strings of `ReportNav`, `ReportFilters`,
`ReportTable`, the export button and the new skeleton. It lived under a gitignored path and was
deleted.

| Width | Analysis selector | Scope controls | Select / date | Export | Table columns | Skeleton |
|---|---|---|---|---|---|---|
| **375** | scrolls — 755px of labels in 343px | **1 column** | **44px** | **44px** | **3 of 6**, no overflow | 480px, 2-col metrics |
| **768** | still scrolls (721px available) | **2 columns** | 36px | 36px | **6 of 6** | 480px |
| **1360** | fits, no scroll | **4 columns** | 36px | 36px | 6 of 6 | 4-col metrics |
| **1600** | fits, no scroll | 4 columns | — | 36px | 6 of 6 | — |

The table **does not overflow at 375** — the three `hideOnMobile` columns already reduce it to three,
so horizontal scrolling is a fallback for wider content rather than the phone strategy. **No
comparison data was removed to avoid scrolling**, and the table was **not** converted to cards.

**Observation, not a defect:** the analysis selector still needs horizontal scrolling at 768, because
six report labels exceed the available width. That is the existing design and the Pattern permits it;
`aria-current` keeps the active analysis identifiable without relying on scroll position.

**Light and Dark both verified**: the skeleton renders `#262626` and animates in Dark, the selected
report uses the brand semantic tokens (`#032d10` on `#7bef92`), and the export button's border
resolves to `border/input` `#666666` — the Wave 6.6 value. **Catalog is not relevant**: Reports never
renders under `.catalog-theme`, and none was fabricated.

#### Validation

| Check | Result |
|---|---|
| `npm run typecheck` · `lint` · `test` · `build` | **all pass** — 0 errors, 0 lint errors (same 2 pre-existing warnings), **791 tests / 47 files** |
| `prettier` | clean on both changed files. Two objections were **mine** — a stray semicolon against `semi: false`, and import placement — both fixed |
| Compiled selectors, clean build vs clean build | **+1 · `.h-64`**, the table skeleton. Nothing else moved |
| **Hardcoded palette in the R4B tree** | **ZERO** |
| **Core components changed** | **ZERO** |
| **New Design System components** | **NONE.** `ReportNav` was not promoted — still one consumer — and no `ReportPage.tsx` was created |

#### Result and remaining debt

All R4B success criteria pass. **Remaining debt: one item, and it is honest rather than technical —
the assistive-technology pass on the new announcement.** The table-row action question was **not**
pulled in: Reports has no row actions, so it does not reach it.

**`Pattern / Report Page` is now PROVEN**, with the evidence recorded accurately: **two real role
contexts over one shared `ReportsView` implementation**, not two independent builds.

**Search / Filters remains PARTIALLY PROVEN.** Reports added date-range, multi-dimension and
filters-as-scope evidence, but it has **no free-text search at all**, so the remaining gap is named
precisely: **free-text search behaviour is not yet broadly proven**.

#### Next rollout group — preview only, NOT AUTHORIZED

Re-audited at current HEAD; the order did **not** survive unexamined.

| Candidate | Routes | Palette | Compact notices | Other reachable debt |
|---|---|---|---|---|
| **Payments** | **3** | **1** | **0** | `TOUCH_FIELD` ×4; one in-row `sm` action |
| People | 5 | 3 | **3** | `CommissionCard` progress |
| Tickets | 7 | 8 | 3 | `BulkTicketCreator`; **Bulk Selection unproven** |
| Dashboards | 2 | **15** | 0 | `CollectionSummaryCard`, `RecentActivityCard`, **no Dashboard Pattern exists** |

**R5 · PAYMENTS** — `owner/payments`, `seller/payments`, `seller/payments/new`.

| Question | Answer |
|---|---|
| Patterns | **List Page + Form**, both proven |
| Palette debt | **1** occurrence, `PaymentDetailDialog` |
| Compact Notice reachable? | **No** |
| Progress reachable? | **No** |
| Table-action touch debt reachable? | **Yes, one occurrence** — and it is the first chance to answer the deferred A/B question on a real screen |
| `TOUCH_FIELD` | reachable ×4 — `PaymentForm`'s local touch constant, now replaceable with the semantic size proven in three domains |
| Prerequisite | **None** |
| Risk | **LOW-MEDIUM** |

**Why Payments next:** it has the least reachable debt of the four, both its Patterns are proven, and
it needs no decision taken first. It also retires `TOUCH_FIELD`, the last ad-hoc touch mechanism
outside `SearchInput`.

**People becomes R6**, and the **compact Notice geometry decision belongs immediately before it** —
People is the first group that actually reaches those three consumers. **Tickets and Dashboards stay
last**: Tickets needs Bulk Selection proven, and Dashboards needs a Pattern contract that does not
exist plus three semantic decisions, against 15 palette occurrences.

---

### 10.34 ROLLOUT R5 — PAYMENTS (2026-09-06 · **COMPLETED AND APPROVED** · commit in §11)

**3 production files, 5 changes, zero Core changes.** Two deferred questions were answered with
evidence, and one of them ended in "change nothing".

| Route | File | Result |
|---|---|---|
| Owner payments | `src/app/(protected)/owner/payments/page.tsx` | **unchanged** |
| Seller payments | `src/app/(protected)/seller/payments/page.tsx` | **unchanged** |
| Seller new payment | `src/app/(protected)/seller/payments/new/page.tsx` | **unchanged** |

Three routes, exactly as the inventory predicted. **No Owner create-payment route exists** and none was
inferred.

#### Blocker gate

| Item | Result |
|---|---|
| Hardcoded palette | **1** — `PaymentDetailDialog`, classified below |
| `TOUCH_FIELD` | **REACHABLE ×4** — local reconciliation |
| `PaymentsTable` row actions, `DataTablePagination`, `Notice`, `StatusBadge`, `SearchInput` | **REACHABLE / ALREADY COMPLIANT** |
| `PaymentProgressBar`, `CollectionSummaryCard`, `CommissionCard`, `BulkTicketCreator` | **NOT REACHABLE** |
| Compact Notice geometry | **NOT REACHABLE** — zero compact panels |

No blocker; nothing required a new token or component contract.

#### The palette occurrence — classified, then migrated

`PaymentDetailDialog` painted its voided-payment panel with four primitive classes from the rose ramp.

**Semantic responsibility: NOTICE / CONTEXT.** It is an inline contextual panel inside a larger
composition, explaining a state — "Pago anulado", when, by whom, why — and its consequence: "Queda en
el historial, pero no cuenta en los saldos."

**Its tone was wrong, and the contradiction was one centimetre away.** Rose is the error family, but
`anulado` is **Neutral** everywhere in this product (`cancelled: 'neutral'` in `constants.ts`) — and
`PaymentsTable` already renders `<StatusBadge tone="neutral">Anulado</StatusBadge>` **on the very row
that opens this dialog**. The same fact was being told in two tones, exactly as the archived client
was in R1.

Migrated to **`Notice tone="neutral"`** with the copy unchanged. **No Status mapping was reopened** —
the existing one was applied to a panel that had never used it — and **no Payments-specific token was
created**. **APPROVED PATTERN COMPOSITION CORRECTION.** Payments palette is now **ZERO**; the rose
utilities that remain in the bundle belong to `LotteryResultsCard`, a different group.

#### `TOUCH_FIELD` — what it was, and what replaced it

The local constant was
`h-12 scroll-mb-[calc(var(--bottom-nav-space)+1rem)] data-[size=default]:h-12 md:h-9 md:data-[size=default]:h-9`,
applied to three controls: the money input, the date input and the payment-method select.

It carried **two unrelated responsibilities**:

* **a touch height** — 48px until `md`, then 36px. Its comment says only "alto tactil de los campos en
  el telefono". No product reason is recorded for 48 over 44, or for `md` over `sm`, and the
  `data-[size=default]:h-12` half existed purely to out-specify the Select's own `h-9`. **This is an
  ad-hoc mechanism that predates the Design System capability.**
* **a scroll margin** — keeping a focused field from sitting behind the bottom navigation bar. **That
  is not a size**, and no component can know it.

**Result: AD-HOC TOUCH MECHANISM → REPLACED BY APPROVED DESIGN SYSTEM CAPABILITY.** The three controls
now use `size="touch"`; the scroll margin survives as `FIELD_SCROLL_MARGIN`, its own named constant
with its own reason. `TOUCH_FIELD` had **zero consumers outside this file** and is gone. `MoneyInput`
gained a `size` passthrough to `Input` — the same shape `ClientArchiveButton` got in R1, and not a
Core change.

**The migration is NOT visually inert, and here is the honest ledger:**

| Width | Old | New | Delta |
|---|---|---|---|
| **375** | 48px | **44px** | −4px, still above the touch floor |
| **640–767** | 48px | **36px** | **−12px — the real change** |
| **768+** | 36px | 36px | **inert** |

The 640–767 band is where Payments stops being an outlier: every other form in the product —
Clientes, Raffles, all four auth forms — already collapses to 36px at `sm`. Payments alone held 48px
to 768. **This is a deliberate consistency correction, not a regression**: 36px at 640 is the same
Comfortable size the rest of the product uses there, and no layout depends on the extra height.
**APPROVED TOUCH-TARGET CORRECTION.**

> **A measurement of mine was wrong first.** The harness initially read the old select at 36px, which
> would have meant the old mechanism silently failed on the Select. It did not: the harness was
> loading the **post-migration** stylesheet, where `data-[size=default]:h-12` no longer exists. Checked
> against the committed build, that rule sits at byte 81420 and the Select's own `h-9` at 81339 — equal
> specificity, **later wins**, so the old select really was 48px. The table above is the corrected one.

#### `PaymentsTable` — the deferred A/B question, answered

**Inventory: exactly ONE in-row action**, the "Ver" button.

| | Evidence |
|---|---|
| Button `onClick` | `setSelected(row.original)` |
| Row `onRowActivate` | `(row) => setSelected(row)` |

**Identical behaviour** — both open the same `PaymentDetailDialog` with the same payment.
**CLASSIFICATION: CASE A — REDUNDANT NAVIGATION AFFORDANCE.**

Traced beyond the label: the row carries `tabIndex={0}` with a real `onKeyDown`, so it is
keyboard-activatable in its own right, and `shouldActivateRow` refuses to fire when the event target
sits inside an interactive element within the row — so the child button does **not** double-trigger,
by mouse or keyboard. Focus stays visible on whichever the user reached.

**Nothing was changed, per the contract.** The larger row target already provides the primary
interaction, and the small button earns its place on **discoverability**: a row that opens a dialog
has no other affordance — no chevron, no link styling — so the button is the only visible signal that
the row does anything. Its `aria-label` is specific ("Ver el pago de {cliente} del {fecha}").

**Carried forward as TABLE ROW NAVIGATION AFFORDANCE RECONCILIATION.** This is the first fully traced
real example, and it is useful evidence — but **one example does not prove every table action shares
the responsibility**, so the product-wide policy stays open. A Case A action creates **two tab stops
per row for one destination** — 50 stops for 25 payments. That is friction rather than a defect, it is
product-wide (`RafflesTable` is identical), and it was not R5's to fix.

Every future table audit must classify each action as **A · duplicates row navigation** or
**B · distinct secondary action** before anything is resized or removed. **No table action has been
globally resized or removed.**

#### Everything else — NO-OP

Owner and Seller payment lists both satisfy the List Page Pattern and were **not touched**; role
differences stand (Owner sees every seller's payments and can void; Seller sees their own). The
empty/no-results distinction was **not** forced anywhere the product does not filter. `PaymentForm`
satisfies the Form Pattern. The allocation `Notice` keeps **Success ↔ Warning with `live`**, and the
one-consumer trailing-value composition is untouched — no `role="alert"`, no assertive, no Error tone,
no new trailing-content prop. Payment Status, Product Data and Progress semantics were all left
exactly as approved; **Wave 6 was not reopened**, and `PaymentProgressBar` is not even reachable here.
`DataTablePagination` and `SearchInput` were audited and found already compliant — **neither was
refactored to reduce debt**.

#### Validation

| Check | Result |
|---|---|
| `npm run typecheck` · `lint` · `test` · `build` | **all pass** — 0 errors, 0 lint errors (same 2 pre-existing warnings), **791 tests / 47 files** |
| `prettier` | clean. One objection was a **pre-existing** class-order nit on a line R5 was editing anyway, so it was fixed |
| Compiled selectors, clean build vs clean build | **0 added · 1 removed** — the dark border utility that only this panel used |
| **Hardcoded Payments palette, after** | **ZERO** |
| **Core components changed** | **ZERO** |
| Validation method | **PRESENTATIONAL HARNESS QA** at 375 / 640 / 768, plus source inspection and the committed-build check described above. **REAL ROUTE QA was not possible**: all three routes need a session and live data, and Supabase is unavailable. **No data-backed validation is claimed** |

#### Result and remaining debt

All R5 success criteria pass. Remaining, and all explicitly out of scope: the **table-row Case A
question** (now evidenced, awaiting a cross-table decision), `SearchInput`'s ad-hoc `touchSize`,
`DataTablePagination` sizing, and the Reports AT pass carried from R4B.

#### Next rollout group — preview only, NOT AUTHORIZED

| Candidate | Routes | Palette | Compact notices | Other reachable debt | Patterns |
|---|---|---|---|---|---|
| **People** | **5** | **3** | **3** | `CommissionCard` progress | List + Detail, both proven |
| Tickets | 7 | 8 | 3 | `BulkTicketCreator`; **Bulk Selection unproven** | List + Detail + Form + an unproven Pattern |
| Dashboards | 2 | **15** | 0 | `CollectionSummaryCard`, `RecentActivityCard`; **no Dashboard Pattern exists** | none proven |

**R6 · PEOPLE** — `owner/sellers`, `owner/sellers/[sellerId]`, `owner/users`, `seller/team`,
`seller/team/[sellerId]`.

| Question | Answer |
|---|---|
| Proven Patterns | **List Page + Detail Page**, both proven three times over |
| Palette debt | **3** occurrences |
| Compact Notice reachable? | **YES — 3 consumers.** This is the group that finally reaches the cluster |
| Progress reachable? | **YES** — `CommissionCard`'s bar, classified in Wave 6 as advancement-toward-completion, deferred ever since |
| Table-row finding relevant? | Not yet observed in People's tables; R6 should re-inventory |
| **Prerequisites** | **TWO decisions before implementation**: the compact Notice geometry extension, and what semantic family owns `CommissionCard`'s progress bar |
| Risk | **MEDIUM** |

**Why People rather than Tickets or Dashboards:** its Patterns are proven and its debt is bounded and
already named, so the two decisions can be taken cleanly in front of it. Tickets additionally needs
**Bulk Selection proven** — an unproven Pattern — and Dashboards needs a Pattern contract that does
not exist at all, against 15 palette occurrences and two unresolved semantic families.

**Recommended shape: an audit/decision step before implementation** — the compact Notice evidence
(6 consumers, 3 of them here) and the Progress question are both contract decisions, and the rollout
rules forbid taking them inside a route migration.

---

### 10.35 R6A — PEOPLE PREREQUISITE AUDIT (2026-09-06 · **COMPLETED AND APPROVED** · commit in §11)

Audit only. **No production file was touched**, and neither prerequisite was implemented.

#### People routes and reachability

| Route | File | Pattern |
|---|---|---|
| Sellers list | `src/app/(protected)/owner/sellers/page.tsx` | List Page |
| Seller detail | `src/app/(protected)/owner/sellers/[sellerId]/page.tsx` | Detail Page |
| Users list | `src/app/(protected)/owner/users/page.tsx` | List Page |
| Team list | `src/app/(protected)/seller/team/page.tsx` | List Page |
| Team member detail | `src/app/(protected)/seller/team/[sellerId]/page.tsx` | Detail Page |

Five routes, **List Page ×3 and Detail Page ×2 — both proven**. No Form, Focused System State or
Report Page responsibility appears.

| Item | Classification |
|---|---|
| Hardcoded palette — 3 occurrences | **PREREQUISITE DECISION** (all three are compact Notice consumers, below) |
| Compact tinted panels — 3 | **PREREQUISITE DECISION** |
| `CommissionCard` | **PREREQUISITE DECISION** |
| `Notice`, `StatusBadge` | **REACHABLE / ALREADY COMPLIANT** |
| `CollectionSummaryCard`, `BulkTicketCreator`, `PaymentProgressBar`, `ProgressRing` | **NOT REACHABLE** |
| `SearchInput`, `DataTablePagination` | **NOT REACHABLE** — none of the three lists filters, searches or paginates |
| In-row table actions | **NOT REACHABLE** — zero |
| Local touch overrides | **NOT REACHABLE** — zero |

**No blocker.** Both prerequisites are contract decisions, not defects.

#### Compact Notice — the evidence set shrank under inspection

Six compact panels exist at HEAD (`rounded-md px-3 py-2`). Applying the semantic gate — *persistent
inline contextual information inside a larger composition* — **two are not Notices at all**:

| # | Consumer | Message responsibility | True Notice? |
|---|---|---|---|
| 1 | `CommissionCard:130` (People) | "Estás en el nivel más alto: $X por cada boleta" — informational, positive | **YES** |
| 2 | `TeamCommissionDialog:177` (People) | consequence of saving: past tickets get recalculated | **YES** — and it already carries `role="status"` |
| 3 | `UserDialog:340` (People) | consequence of changing the email: the old invitation link dies | **YES** |
| 4 | `TicketImportDialog:321` (Tickets) | "Se importarán N boletas, las otras M quedarán fuera" | **YES** |
| 5 | `BulkActionDialog:112` | **`role="alert"`** · "No se puede continuar todavía" + blocked list | **NO — blocking error** |
| 6 | `BulkAssignDialog:111` | **`role="alert"`** · same shape | **NO — blocking error** |

**5 and 6 are excluded, and firmly.** They announce assertively and they *block the dialog's
decision*. Notice v1 has **no Error tone** and **must never emit `role="alert"`**, so these are not
compact-Notice consumers — they are not Notice consumers at all. They belong to the existing
form/dialog error pattern.

**True evidence: four consumers, three of them in People.** Still comfortably past the two the
contract requires.

#### Geometry: it is DENSITY, not SIZE

| | Default Notice | Compact candidates |
|---|---|---|
| Radius | `rounded-lg` | `rounded-md` |
| Padding | `px-4 py-3` | `px-3 py-2` |
| Typography | `text-sm` | **`text-sm` — identical** |
| Content hierarchy | body text | **body text — identical** |
| Icon | optional | **none of the four has one** |
| Action | optional | **none of the four has one** |

Only spacing and radius move; **typography and content hierarchy are unchanged, and no structural
region appears or disappears**. By the contract's own test that is **density**, not size — the
responsibility is identical and only compactness differs.

**DECISION RETURNED: NOTICE COMPACT EXTENSION JUSTIFIED.**

| | Proposal |
|---|---|
| Public property | **`density`** |
| Values | `'default' \| 'compact'` |
| Default | `'default'` — no existing consumer changes |
| Evidence | the four true consumers above |
| People adopters | `CommissionCard`, `TeamCommissionDialog`, `UserDialog` |
| Figma | **one independent axis** beside `Tone` — never `Info / Compact / Icon / Action` combinations. Icon and Action stay slots; live behaviour stays code metadata |
| Tokens | **none created.** Compact geometry is not a colour semantic; it reuses existing spacing, radius, typography and the `status/*` tones. **No missing spacing or radius token was found** — `rounded-md`, `px-3`, `py-2` all exist |
| Accessibility | unchanged. Two of the three People consumers are **dynamic** (they appear on change), so they should adopt `live` — `TeamCommissionDialog` already hand-rolls `role="status"`, whose implicit polite announcement `live` reproduces exactly |
| Risk | **LOW** — an additive, defaulted property; no existing consumer moves |

**Notice v1 was not otherwise reopened**: no title, no dismissible, no Error tone, no floating, no
trailing-content, no className, no prop spreading.

#### Progress — three consumers, three different answers

Traced from data origin to visual output, not from the word "progress".

| Consumer | Numerator ÷ denominator | 100 means | Classification |
|---|---|---|---|
| **`CommissionCard`** | `ticketsPaid ÷ nextMinTickets`, capped at 100 | the seller reaches the **next commission tier** and their rate changes | **D · THRESHOLD / GOAL PROGRESS** |
| **`CollectionSummaryCard`** | `totalCollected ÷ totalSold`, labelled "Porcentaje recaudado" | everything sold has been collected | **B · BUSINESS COMPLETION PROGRESS** |
| **`BulkTicketCreator`** | `done ÷ total`, labelled "Progreso del guardado" | the save finished | **A · GENERIC PROCESS PROGRESS** — unchanged from its earlier classification |

`CommissionCard` is **definitively not Product Data**: its denominator is a **rule** — the tier
minimum — not a quantity being decomposed into categories. Nothing is being composed; something is
being approached. Money is involved, which is exactly the trap the contract warns about.

#### Current Progress contract — the five things are NOT equivalent

| | Status |
|---|---|
| **Figma contract** | **EXISTS** — `Progress / Linear`, a component set with `Amount`, `Percent` and `Value` |
| **Semantic tokens** | **EXIST** — `progress/track` and `progress/value` in all three scopes, `progress/value` aliasing `brand/default` |
| **Token consumers** | **ZERO.** Nothing in the product uses `progress-track` or `progress-value`. The roles have been sitting unused since Wave 1 |
| **Code component** | **DOES NOT EXIST.** The only progress components are `ProgressRing` and `PaymentProgressBar`, both **Product Data** |
| **Production consumers** | **EXIST — four non-Product-Data bars**, each hand-rolling its own markup: `CollectionSummaryCard`, `CommissionCard`, `SellerKpis`, `BulkTicketCreator` |
| **Accessibility contract** | **NOT CODIFIED, but consistent in practice** — all four hand-roll `role="progressbar"` with `aria-valuemin/max/now` and an `aria-label`. All represent a completion percentage, so the role is appropriate in each case |

#### FINDING — the same measure is currently in two families

`SellerKpis`' bar is labelled **"Porcentaje del dinero ya cobrado"** and `CollectionSummaryCard`'s is
**"Porcentaje recaudado"**. They are the **same measure** — collected ÷ sold — yet:

* `SellerKpis` was migrated in **Wave 6 to `data/paid`** (Product Data, green);
* `CollectionSummaryCard` was **deferred as Progress** and still renders `bg-primary` (brand).

By this audit's own reasoning — completion, not decomposition — **both are Business Completion
Progress**, which means Wave 6 placed one of them in the wrong family. **Nothing was changed**: Wave 6
is approved baseline and this is an audit. But a Progress reconciliation cannot be designed around
`CommissionCard` alone without deciding whether `SellerKpis`' bar moves too — and that one **would
change colour**, green → brand.

Worth noting for the eventual decision: `CollectionSummaryCard` adopting `progress/value` would be
**visually inert**, because `bg-primary` and `progress/value` both resolve to `brand/default`.

#### Progress — minimum reconciliation proposed

**Classification: B · COMPLETING AN EXISTING PARTIAL CONTRACT.** The Figma contract and the tokens
already exist; what is missing is a code component and the decision about which consumers belong.

| | Proposal |
|---|---|
| Component | **one generic linear progress**, in `components/data/`, consuming `progress/track` and `progress/value` |
| API | **generic only** — a value, a max, an accessible label. **No `commission`, `collection` or `saving` variants**; business meaning stays with the consumer |
| Accessibility | codify what the four already do: `role="progressbar"` with min/max/now and a required accessible label |
| Tokens | **none new** — the two roles exist and are unused |
| Scope decision needed | whether `SellerKpis`' bar moves out of Product Data, per the finding above |

**Is Progress a People prerequisite? YES, but narrowly.** People reaches exactly one consumer,
`CommissionCard`, and it is a **threshold/goal** bar that no approved family currently owns — it is
neither Product Data nor a Notice nor a Status. Migrating People without deciding this would leave a
hand-rolled bar on a migrated screen, or push it into Product Data, which the trace disproves.

**Other groups benefit**: Dashboards reaches `CollectionSummaryCard` and `SellerKpis`, Tickets reaches
`BulkTicketCreator`. All three remaining groups touch this family, so resolving it before People pays
forward.

#### People palette — all three are the Notice decision

| Occurrence | Semantic responsibility |
|---|---|
| `UserDialog:340` | **NOTICE** — consequence of changing the email |
| `TeamCommissionDialog:177` | **NOTICE** — consequence of saving a new commission |
| `CommissionCard:130` | **NOTICE** — informational, top tier reached |

**The compact Notice decision eliminates all three.** No other semantic family appears in the People
tree, and no additional blocker was found.

#### Search / Filters — People adds nothing

**None of the three People lists has free-text search, filters or pagination** — they are small
bounded collections (an organisation's sellers, its users, a seller's team), the same shape as
Raffles. A successful R6 therefore **cannot** move Search / Filters to PROVEN; the remaining gap
stays exactly where it was: **free-text search behaviour is not yet broadly proven**.

#### Recommendation

**A separate prerequisite checkpoint IS required** before People.

**R6B — PEOPLE DESIGN SYSTEM PREREQUISITE RECONCILIATION**

1. **Notice `density` extension** — Figma axis + code property + the four evidence consumers
   documented. Low risk, additive, nothing moves by default.
2. **Progress reconciliation** — complete the partial contract with one generic linear component on
   the existing unused tokens, and decide the `SellerKpis` scope question the finding raises.

**Then R6 — PEOPLE**, five routes, List ×3 and Detail ×2, expected to be small: adopt compact Notice
in three consumers (which zeroes the palette), adopt Progress in `CommissionCard`, and verify the two
proven Patterns. **Risk: MEDIUM before the prerequisites are decided, LOW after** — the routes
themselves are clean, with no search, no pagination, no table actions and no touch overrides.

---

### 10.36 R6B — PEOPLE DESIGN SYSTEM PREREQUISITE RECONCILIATION (2026-09-07 · **COMPLETED AND APPROVED** · commit in §11)

Both prerequisites are closed. **9 files: 1 new component, 8 migrated consumers. Zero Core changes,
zero new tokens.** The Figma contract was read directly rather than inferred, and it settled the two
open API questions on its own.

#### Prerequisite 1 — Notice gains `density`

| | Shipped |
|---|---|
| Property | **`density`**, values `default` and `compact`, defaulting to `default` |
| What moves | **padding and corner radius only** — 16/12 px and the large radius become 12/8 px and the medium radius |
| What does not move | typography, content hierarchy, tone tokens, the icon slot, the action slot, the live-region behaviour, the responsive row/column switch |
| Tokens created | **none** — compactness is spacing, not colour |
| Core reopened | **no**: no title, no dismissible, no Error tone, no floating variant, no `className`, no prop spreading |

Four consumers adopted it, exactly the four R6A proved:

| Consumer | Group | Tone |
|---|---|---|
| `CommissionCard` | People | success |
| `TeamCommissionDialog` | People | warning |
| `UserDialog` | People | warning |
| `TicketImportDialog` | Tickets | warning |

**The two excluded panels stayed excluded**, and People turned up **two more of the same family** —
`TeamCommissionDialog` and `UserDialog` each carry a submit-error paragraph with `role="alert"` on
the `destructive` role. Four blocking form errors now, all correctly outside Notice: Notice has no
Error tone and must never announce assertively.

##### `role="status"` is not `aria-live="polite"`, and it was not treated as if it were

`TeamCommissionDialog` already announced its recalculation warning with `role="status"`. That role
implies **both** a polite live region **and** `aria-atomic` — the whole region is re-read, not just
the changed part. Notice's `live` produces a polite region **without** `aria-atomic`, so swapping one
for the other would have quietly changed what a screen reader says.

**Resolution: the announcement is preserved in an external region.** No `role` property was added to
Notice, and its live-region contract is untouched.

##### GATE — status-message classification, decided per consumer

Every R6B compact Notice was classified against one question: is this **contextual content arriving
with a composition**, or a **status message the user must perceive while focus stays where it is**?
Decided from workflow evidence, never from the fact that a component is conditional.

| Consumer | What actually happens | Class | Live semantics |
|---|---|---|---|
| `CommissionCard` | rendered once from server props; **its text never changes afterwards** | **A** | **NONE REQUIRED** |
| `TeamCommissionDialog` | the dialog is already open; the user changes the model or the amount, and the warning appears **at the same moment the save button becomes enabled**. D-127 requires it be read **before** saving | **B** | status |
| `UserDialog` | the user edits the address of a pending invitation; the message says the previous invitation link **stops working**. Missing it means silently breaking someone else's invitation | **B** | status |
| `TicketImportDialog` | the preview is painted from what the browser could check, then the raffle-side verification returns and **rewrites both counts**. Nobody typed anything | **B** | status |

`CommissionCard` is the clean **A**: not dynamic at all. **No live region was added**, and none is
required — adding one because a component is conditional is exactly what the contract forbids.

##### GATE — the three status messages needed a structural fix, not a property

All three announced from a region that **mounted together with its own text**. A region that appears
already written is not reliably announced: assistive technology has to be watching it beforehand.
Preserving the old markup was therefore **not** evidence that the old markup worked.

**Fix: the region is now permanent and the notice moves in and out of it.** One region per consumer,
containing nothing but the message, so the atomic reading `role="status"` implies stays correct.
**Notice's public API did not change**, and no ARIA role was pushed into the visual component.

The empty region is kept out of the layout with `empty:sr-only` — chosen deliberately over hiding
it, because hiding removes it from the accessibility tree and puts the original problem straight
back. Measured in both surrounding layouts: **identical spacing with and without the region** (16 px
and 8 px, unchanged), so the fix is visually inert.

#### Prerequisite 2 — Progress, settled by reading the Figma contract

R6A recorded that the Figma contract, the tokens, the code component and the production consumers
were **five non-equivalent things**. The contract was measured directly this time — the reference
render decoded pixel by pixel rather than eyeballed:

| Figma `Progress / Linear` (`93:2658`) | Measurement |
|---|---|
| Track | **300 × 8 px** — the bar occupies rows 0–7 exactly |
| Value bar | **rounded at both ends**, inset in the track |
| Fill colour | `rgb(13,125,45)` — `brand/default` in Light |
| Track colour | `rgb(229,229,229)` — **exactly the Light `progress/track` value** |
| Variant axis | `Value` at five steps. **One geometry. No size axis** |
| Label row | a separate frame below the track, holding `Amount` and `Percent` |

##### §23 — the second geometry does not exist, so nothing was expanded

Three of the four production bars were already 8 px. `SellerKpis` alone was **6 px**. Against the
three tests: the Figma contract does **not** own that height, existing sizing does not express it,
and there is **one occurrence with no recurring evidence**. It is **legacy divergence**, so it adopts
the contract geometry. **No size variant was added, the component API was not expanded, and no STOP
was required.**

##### §16 — one consumer really does need a maximum

Three consumers count in per cent. `CommissionCard` does not: its accessible semantics are
`aria-valuemax` = the next tier minimum and `aria-valuenow` = tickets collected, with an
`aria-valuetext` in tickets. A percentage-only API would have destroyed that.

**Minimum generic API supporting the real set:**

| Property | Purpose |
|---|---|
| `value` | in whatever units the consumer counts |
| `max` | defaults to 100, so the three percentage consumers pass nothing |
| `label` | **required** accessible name |
| `valueText` | optional, for when the raw number means nothing alone |

Nothing else. **No `commission`, `collection`, `saving`, `success` or `warning` variants**; no
percentage rendering, no label row, no goal explanation — the Figma `Label` frame is the consumer's
own text, which is where all four already keep it. Visual width is clamped to 0–100 % always,
preserving the cap `CommissionCard` already had.

**The required name closes a real gap**: `CommissionCard`'s bar had **no accessible name at all**,
only a value text. It now has one, drawn from the words already on that screen.

##### The four migrations, and the honest visual ledger

`LinearProgress` lives in `components/data/` and is the **first consumer the `progress/*` roles have
had since Wave 1**. `PaymentProgressBar` and `ProgressRing` were **not touched and not merged** —
they decompose the price of one ticket and remain Product Data.

| Consumer | Group | Family | Fill before → after | Height |
|---|---|---|---|---|
| `CollectionSummaryCard` | Dashboards | B · business completion | near-black → brand green | 8 px |
| `CommissionCard` | People | D · threshold / goal | near-black → brand green | 8 px |
| `BulkTicketCreator` | Tickets | A · process | near-black → brand green | 8 px |
| `SellerKpis` | Dashboards | **B · reclassified from Product Data** | `data/paid` → `progress/value` | **6 → 8 px** |

**This is not visually inert, and the reason is worth recording.** The three brand-coloured bars were
never brand-coloured: they used the **unmigrated shadcn primary role**, which is `#171717` in Light
and `#e5e5e5` in Dark. On screen they read as near-black bars. They now render `#0d7d2d` / `#17c246`,
which is what the Figma contract has always shown.

The track moves too: `#f5f5f5` → `#e5e5e5` in Light, which is **more visible, not less**, and is
inert in Dark, where both resolve to `#262626`.

`SellerKpis` changes twice — colour and height — and both were approved. Its bar and
`CollectionSummaryCard`'s measure **the same thing**, money collected over money sold, and after R6B
they finally look identical. It also gains the width transition the other three already had.

> ##### GATE — `CommissionCard` reachability, corrected
>
> **`CommissionCard` is imported by nothing.** Verified across the whole tree, not assumed: the only
> textual matches are `TeamCommissionCard`, a different component. It has been unmounted since
> 2026-08-25 (D-112) and is preserved deliberately, for two warnings the replacement indicator cannot
> fit.
>
> | | |
> |---|---|
> | Classification | **TRUE LINEAR PROGRESS CONSUMER** |
> | Migration | done during Design System reconciliation, and justified — it was one of the recurring hand-rolled implementations |
> | Reachability | **CURRENTLY NOT RENDERED / NOT ROUTE-REACHABLE** |
> | Validation | **source + presentational-harness only.** No route validation is claimed |
>
> The earlier claim that **People reaches `CommissionCard`** is therefore **withdrawn**. See §10.37.

##### Non-text contrast

| | Fill vs track | Verdict |
|---|---|---|
| Light, after | **4.18 : 1** | passes the 3:1 non-text threshold |
| Dark, after | **6.37 : 1** | passes |
| Light, before — `SellerKpis` | **3.35 : 1** | the weakest case in the product, now improved |

Exact resolved values, before → after:

| | Fill, Light | Fill, Dark | Track, Light | Track, Dark |
|---|---|---|---|---|
| `CollectionSummaryCard`, `CommissionCard`, `BulkTicketCreator` | `#171717` → `#0d7d2d` | `#e5e5e5` → `#17c246` | `#f5f5f5` → `#e5e5e5` | `#262626` → `#262626` |
| `SellerKpis` | `#009966` → `#0d7d2d` | `#00d492` → `#17c246` | `#f5f5f5` → `#e5e5e5` | `#262626` → `#262626` |

##### GATE — accessible range validity

The visual width is clamped, and the contract requires the **accessible** semantics to be equally
valid. Traced to each source rather than assumed:

| Consumer | Guarantee | Where it comes from |
|---|---|---|
| `CollectionSummaryCard` | value in 0–100, max 100 | `calculateCollectionSummary` clamps and rounds |
| `SellerKpis` | value in 0–100, max 100 | `percentageOf` clamps **and** returns 0 when the total is not positive |
| `BulkTicketCreator` | 0 ≤ done ≤ total, total ≥ 1 | the save **returns early** when there is nothing to send, before the counter exists |
| `CommissionCard` | value < max, max ≥ 1 | the tier query selects the next tier **strictly above** the tickets already collected |

**Every real consumer naturally satisfies min ≤ now ≤ max with a positive max, so no code was
added.** The invalid shape the contract warns about — a current value above its own maximum — cannot
be produced by any of them.

#### Figma — what could NOT be done

**The connected Figma tools are read-only.** They expose metadata, design context, variable
definitions, screenshots and Code Connect; **none of them can add a variant axis to a component
set.** The Density axis therefore **remains a pending design-owner action**, specified here so it can
be applied exactly:

| Notice density | Status |
|---|---|
| Contract | **APPROVED** |
| Code | **IMPLEMENTED** |
| Figma | **AXIS PENDING DESIGN-OWNER SYNC** — reason: **tooling limitation** |

This is **design-source sync pending**. It is **not** a Core defect and **not** a People blocker, but
**full Figma ↔ Code parity for Notice must not be claimed until it is synchronized**, and the
requirement carries forward to final broad-release Design System QA.

* On `Notice`, add **one independent axis** beside `Tone`, values `Default` and `Compact`.
* **Never** as combined variants such as `Info / Compact / Icon / Action` — icon and action stay
  slots, and live behaviour stays code metadata.
* `Progress / Linear` needs **no change** — 8 px, the two `progress/*` roles, one geometry, no
  size axis. **FIGMA ↔ CODE CONTRACT: ALIGNED.** The fixed-step limitation recorded in §7 is a Figma
  authoring constraint, not a divergence.

Until that axis exists, **the Figma file and the code disagree by one property**. It is recorded, not
hidden.

#### Validation

| Check | Result |
|---|---|
| `npm run typecheck` · `lint` · `test` | **pass** — 0 errors, 0 lint errors (the same 2 pre-existing warnings), **791 tests / 47 files** |
| `npm run build` | **pass** |
| `prettier` | clean. Two genuine objections, both mine, were fixed; the rest of the file-level noise is the repo-wide line-ending condition, verified by comparing normalized content |
| Compiled selectors, **clean build vs clean build** | **2 added · 3 removed** |
| Added | the two `progress/*` utilities — the roles are no longer unused |
| Removed | the three hardcoded amber utilities the two People dialogs were using |
| **People hardcoded palette, after** | **ZERO** |
| **Core components changed** | **ZERO** |
| Hand-rolled progress bars remaining | **ZERO** — only `LinearProgress`, `PaymentProgressBar` and `ProgressRing` carry the role |
| `data/*` roles orphaned by the reclassification | **none** — 9 consumers remain |
| Validation method | **PRESENTATIONAL HARNESS QA** in Light and Dark at 1360, 900 and 375, plus source inspection, resolved-token comparison, computed contrast and the decoded Figma reference. **REAL ROUTE QA was not possible** — Supabase is unavailable and every affected route needs a session and live data. **No data-backed validation is claimed.** The harness was served from a gitignored path and deleted |

#### Remaining debt after R6B

* `TicketImportDialog` keeps **one** hardcoded green icon on its completion result panel — a
  bordered success summary with a title line, not the compact contextual pattern. Adopting Notice
  there would require a **title**, which Notice v1 deliberately does not have. **Tickets-group debt,
  and a Notice v2 question.**
* Everything carried into R5 is still open: the table-row action question, `SearchInput`'s ad-hoc
  touch sizing, pagination sizing, and the Reports assistive-technology pass.

---

### 10.37 PEOPLE PREFLIGHT — REFRESHED AFTER R6B (2026-09-07 · **READY FOR EXECUTION**, not authorized)

Re-inventoried against the reconciled tree, not carried over from R6A.

| Gate | R6A said | Now |
|---|---|---|
| Routes | 5 — List ×3, Detail ×2 | **unchanged**, both Patterns proven |
| Hardcoded palette | 3 | **ZERO** — all three were the Notice decision |
| Compact Notice consumers | 3 unmigrated | **ZERO left** — all three migrated in R6B |
| Progress | `CommissionCard` unowned | **prerequisite CLOSED · current People route reach: NONE** |
| Search / filters / pagination | none | **confirmed none** — three small bounded collections |
| Local touch overrides | none | **confirmed none** |
| Blocking form errors | not counted | **2**, both on the `destructive` role with `role="alert"` — correctly outside Notice, **no debt** |
| **In-row table actions** | **"zero"** | **WRONG — there are two.** Corrected below |

#### Reachability, walked rather than assumed

The import graph of all five routes was traversed, so the table below is what the routes actually
reach — not what the feature folders contain.

| | Routes reaching it |
|---|---|
| `Notice` | **5 of 5** |
| `UserRowActions` | **3** — `owner/sellers`, `owner/sellers/[sellerId]`, `owner/users` |
| `TeamMemberActions` | **1** — `seller/team/[sellerId]` |
| `DataTable` | **2** — `owner/sellers`, `owner/users` |
| `LinearProgress` and every Progress consumer | **0** |
| `SearchInput`, `DataTablePagination` | **0** |
| `PaymentProgressBar`, `ProgressRing` | **0** |

Two consequences worth stating plainly:

* **PROGRESS · PREREQUISITE RECONCILED · CURRENT PEOPLE ROUTE REACH: NONE.** No People route renders
  a progress bar of any kind. The reconciliation was still the right prerequisite — it unblocked the
  family and four real consumers elsewhere — but People does **not** exercise it, and R6C must not
  mount `CommissionCard` merely to give the new component something to do.
* **`seller/team` does not use `DataTable`.** It composes `TeamMemberList` with metric cards, so
  only **two** of the three List Pages are table-based. R6C audits it on its own terms.

#### Correction to R6A

R6A reported **zero in-row table actions in People**. That is **incorrect**. `UserRowActions` is
rendered inside the rows of **two** People tables:

| Table | Row navigation | In-row action |
|---|---|---|
| `SellersTable` | a link in the name cell | actions menu |
| `UsersTable` | **none** | actions menu — **the only affordance on the row** |

Its third appearance, on the seller detail page, is a **page-header** action, not in-row.
`TeamMemberActions` is likewise a detail-page header action.

**This is not the R5 case.** R5's finding was **Case A** — a button duplicating row activation, two
tab stops for one destination. Here the menu holds **distinct administrative actions** (edit,
deactivate, resend the invitation), so it is **Case B**, and in `UsersTable` it is the row's only
affordance. Nothing about R5's Case A reasoning transfers.

**What is genuinely reachable is the touch target.** The trigger is a 36 px icon button at every
width, and **neither table has a phone card variant** — both render as tables at 375 px. The Design
System already ships the capability that resolves this: an icon button that is **44 px on phones and
36 px from the small breakpoint up**, the direct analogue of the field sizing R5 applied. **No Core
change is required.**

#### Verdict

**READY FOR EXECUTION. Risk: LOW.** Both prerequisites are closed, the palette is already at zero,
and the one real finding has an approved capability waiting for it.

Expected shape of R6: verify the two proven Patterns across five routes, apply the existing touch
capability to the two in-row triggers, and confirm the three R6B People migrations on their real
routes. **A successful R6 still cannot move Search / Filters to PROVEN** — People has none, exactly
as R6A said.

---

### 10.38 R6D — DROPDOWN MENU TOUCH RECONCILIATION (2026-09-07 · **COMPLETED** · commit in §11)

A prerequisite found by the People rollout's own gate, fixed in the shared primitive and checkpointed
**before** the route work. **One line, two utilities, one file.**

#### The audit — measured, not asserted

The question was whether the menu items' **actual interactive box** is short, or only their visual
content. Measured on the real compiled classes at 375 px:

| | Result |
|---|---|
| Interactive box | **230 × 32 px** |
| `min-height` | **0** — nothing else was setting a floor |
| Padding | 6 px top and bottom, around a 20 px line |
| Gap between adjacent items | **0 px** — the targets touch each other |
| A larger enclosing target | **none.** The item is the interactive element |

So the escape hatch does not apply: the short box **is** the hit area.

#### Which primitives were in scope

Only where real product evidence exists — never by name symmetry:

| Primitive | Production uses | In scope |
|---|---|---|
| `DropdownMenuItem` | **9 uses in 6 files** | **YES** |
| `DropdownMenuCheckboxItem` | **0** | no |
| `DropdownMenuRadioItem` | **0** | no |
| `DropdownMenuSubTrigger` | **0** | no |
| `DropdownMenuLabel` | 3 | no — not interactive |

The three unused siblings share the same geometry. **They were not touched**, and they should adopt
the same floor when they first gain a consumer.

#### Classification

| Criterion | Verdict |
|---|---|
| Independent actions, directly interactive, reachable at 375 px | yes |
| Backed by a larger row target | **no** — in `UsersTable` the menu is the row's only affordance, and inside the user menu there is no row at all |
| WCAG 2.5.8 Target Size (Minimum), 24 × 24 | passes |
| The product's own ~44 px phone convention (D-085) | **12 px short** |

**VERIFIED SHARED COMPONENT TOUCH CONTRACT GAP.**

#### Blast radius, reported before the change

| | Reach |
|---|---|
| Primitive changed | `DropdownMenuItem` **only** |
| Occurrences | 9, in 6 files |
| Seller reach | the user menu via the application shell — **every protected route** — plus the sign-out entry, the install entry, the guided-tour entry and the ticket selection toolbar |
| Owner reach | the same, plus the People row actions in two tables and one detail header |
| **Catalog reach** | **NONE.** The public catalog route does not reach the dropdown at all |
| Phone delta | **32 px → 44 px** per item |
| Desktop delta | **inert** |

#### The fix, and why this shape

A responsive **minimum** height, mirroring the touch sizing the Button already uses: a 44 px floor on
phones, released from the small breakpoint upward so the height goes back to being content-driven.

* **No route-local heights**, no padding hacks, and nothing added to `UserRowActions`.
* **No `MobileDropdownItem`**, no People-specific item.
* **No new API.** A floor is not a size axis, and no consumer has to opt in.
* It is a **minimum**, not a fixed height: an item whose text wraps to two lines still measures 72 px
  at every width, exactly as before.

#### Measured after

| Width | Item height | Whole menu |
|---|---|---|
| **375** | **44 px** (was 32) | 142 px (was 106) |
| **768** | **32 px** | **106 px — identical to before** |
| **1360** | **32 px** | **106 px — identical to before** |

**Desktop is provably inert.** Menu density above the small breakpoint did not move.

#### Accessibility

Menu semantics were **not touched**: keyboard navigation, roving focus, arrow keys, Escape, submenu
behaviour, selection and focus return are all Radix's, and the change adds two geometry utilities to
a class string. Nothing else in the file changed.

#### Validation

| Check | Result |
|---|---|
| `typecheck` · `lint` · `test` · `build` | **all pass** — 791 tests / 47 files, same 2 pre-existing warnings |
| Diff | **one line** in one file |
| Method | **PRESENTATIONAL HARNESS QA** with measured geometry on the real compiled classes, at 375 / 768 / 1360 |

---

### 10.39 R6C — PEOPLE MIGRATION (2026-09-07 · **COMPLETED AND APPROVED** · commit in §11)

**7 production files, zero Core files, zero new utilities.** The clean selector comparison against the
R6D checkpoint is **0 added · 0 removed**: everything R6C does is either an existing class or a
semantic element, which is the strongest available evidence that no route-specific shortcut was
introduced.

| Route | Pattern | Result |
|---|---|---|
| `owner/sellers` | List Page | **PASS — unchanged** |
| `owner/users` | List Page | **PASS — unchanged** |
| `seller/team` | List Page | **PASS — unchanged** |
| `owner/sellers/[sellerId]` | Detail Page | **PASS** after composition corrections |
| `seller/team/[sellerId]` | Detail Page | **PASS** after composition corrections |

Five routes, re-confirmed against HEAD. Scope was not broadened.

#### Blocker gate after R6B

| Item | Result |
|---|---|
| Hardcoded palette across both route trees and all four feature trees | **ZERO** |
| Compact Notice legacy panels | **ZERO** — the three People ones shipped in R6B |
| Progress prerequisite | **CLOSED**, and **not reachable here** |
| Status semantics | already semantic — the account badge throughout |
| Search · filters · pagination · the search field | **not reachable**, confirmed by walking the import graph |
| Local touch overrides | **none** |
| Blocking form errors | **2**, on the `destructive` role with `role="alert"`. **Correctly outside Notice, no debt** |

#### The three List Pages, audited individually

| | `owner/sellers` | `owner/users` | `seller/team` |
|---|---|---|---|
| Header + context | page header with description and a compact primary action | same | same, description varies with the active raffle |
| Primary action | invite a seller | invite an administrator | add a team member, **only when allowed** |
| Data region | table | table | **card grid**, not a table |
| Entity state | account badge column | account badge column | account badge per card |
| Empty state | yes, with its action | **none, correctly** | **two different ones**, by cause |
| Phone behaviour | table with responsive columns | table with responsive columns | cards, whole card is the target |
| Row actions | actions menu | actions menu | none — the card is the link |
| Role metadata | team, earnings, inventory | role, activation | sales, earnings |

Notes worth keeping:

* **`owner/users` has no empty state and should not have one.** The administrator list always
  contains at least the owner. Inventing an unreachable state is not pattern conformance.
* **`seller/team` is not table-based.** It composes a card grid with metric cards, and its own
  comment explains why: a seller reads it on a phone. **No table was imposed on it.**
* **Its two empty states are distinct on purpose** — "you have no team yet" with the action, and
  "you belong to someone else's team" without one, because that seller cannot form a team (BR-E03).
* **No search, filter or pagination was added**, and **no No-Results state was invented**: without
  filtering it is not a reachable state.

#### The two Detail Pages — identity was missing its state

Both already satisfied most of the pattern: back link, identity, actions in the header, subordinate
regions, and — on the team member page — a contextual Notice for the pending invitation.

**What was wrong is the same thing D-113 fixed for clients.** The account state sat as a field inside
a contact card, when it is the fact that governs the whole screen: an inactive seller cannot sign in,
and an invitation still pending can still have its address corrected.

**Correction: the state badge moved to the title and the duplicate field was removed.** The badge
component is the same one the tables use. The seller detail's three closing actions and the team
member's two header actions also adopted the touch size the pilot established for detail actions —
44 px on phones, 36 px from the small breakpoint. **Approved touch-target composition correction**,
using existing sizing.

#### `UserRowActions` — exact reach, and both A/B cases in one group

| Where | In row? |
|---|---|
| `SellersTable` | **yes** |
| `UsersTable` | **yes** |
| `owner/sellers/[sellerId]` | no — page-header action |

`TeamMemberActions` is header-only, and `seller/team` has no row actions at all.

**Classification: CASE B — DISTINCT SECONDARY ACTIONS.** The menu holds edit, deactivate and resend
the invitation. None duplicates navigation, and in `UsersTable` — which passes no row destination —
**the menu is the row's only affordance**.

People also supplies the other case, in the same group:

| Table | Row destination | Redundant link | Actions menu |
|---|---|---|---|
| `SellersTable` | yes | name cell — **Case A** | **Case B** |
| `UsersTable` | **none** | — | **Case B**, sole affordance |
| `PaymentsTable` (R5) | yes | a button to the same dialog — **Case A** | — |

**The two cases are now validated by real product evidence and must not be collapsed into one rule.**
And Case A already has a documented answer that R5 did not have in view: `DataTable`'s own contract
states why the link is kept beside a clickable row — it supplies the context menu, "open in new tab",
and **a named keyboard stop** — while the row-activation rules stop one click counting twice. So the
redundant affordance is an approved decision, not debt. **Nothing was changed in Payments, and no
product-wide table-action policy was created.**

#### GATE A — the row trigger, and the shared menu behind it

The trigger itself was corrected here: **36 × 36 → 44 × 44 on phones**, using the Design System's
existing capability. No local height, no route breakpoint, no Core change.

The **menu items** behind it turned out to be a different matter. Measured rather than eyeballed,
their real interactive box was 32 px with no larger target behind it, which is a shared-primitive
question, not a People one. It was therefore **taken out of R6C and shipped as its own prerequisite
checkpoint, R6D** (§10.38), before this rollout was committed. **R6C contains no Core change.**

#### GATE B — heading responsibility, decided by authority

The question was whether the card-titled regions are true document sections or local labels. Decided
from what each title is responsible for, never from its size or weight:

| Title | Where | Class |
|---|---|---|
| Datos de contacto · Equipo y comisión | seller detail | **A — true section heading** |
| Datos de contacto | team member detail | **A** |
| Datos de la rifa | raffle detail | **A** |
| Cuánto gana | the commission card, rendered **only** on the team member detail | **A** |
| Catálogo público | the catalogue settings card, rendered **only** on the seller detail | **A** |
| Inventario · Dinero · Cómo va · Sus ventas · Boletas de esta rifa | both detail pages and the raffle detail | **A — and already real headings** |
| The label of a metric card | everywhere | **C — data label.** Nine of them per page would flood the outline. **Correctly stays a plain element** |
| The card titles of the sign-in and password screens | auth screens | **out of scope** — those are page titles on a different Pattern, not detail sections |
| Every dashboard, lottery and catalogue-facing card title | Dashboards and Catalog | **not audited** — they belong to their own rollouts |

**Verdict: VERIFIED DETAIL-PATTERN ACCESSIBILITY DEFECT.** Five titles that name a whole section of a
detail page were rendering as plain elements, so those sections did not exist in the document
outline — the pages offered a title and then three or four unreachable regions.

**Fix: composition-level, exactly the shape the Design System already ships.** `TableSection` — the
system's own titled region — wraps its title in a real heading inside the card title, and these now
do the same. **`CardTitle` itself was NOT changed**: it legitimately labels a metric elsewhere, and a
global change would have turned every metric label into a heading.

**Heading level follows the document, not the type scale:** each page has one page title, and these
are its direct children, so they are all one level below it — the same level the existing section
headings already used.

**Visually inert, and verifiable:** the reset already forces headings to inherit size and weight and
carry no margin, and the selector comparison for R6C is **empty**.

##### The correction crosses a previously approved rollout, deliberately

The raffle detail carried the identical defect from R2. **It was not protected for having been
approved**: new accessibility evidence corrects an older rollout. **APPROVED PATTERN ACCESSIBILITY
RECONCILIATION**, applied only to the instances this audit actually verified.

**Not broadened:** the two ticket detail pages carry the same shape and were **left alone** — they
belong to the Tickets rollout, which will audit them on its own terms. Recorded so that rollout
inherits the finding rather than rediscovering it.

#### Touch target — measured, not asserted

| Width | Row action trigger | Detail action | Menu item | Columns shown | Table overflow | Page scrolls sideways |
|---|---|---|---|---|---|---|
| **375** | **44 × 44** (was 36 × 36) | **44 px tall** | **44 px** (R6D) | 5 of 7 | 35 px, **inside the table's own scroller** | **no** |
| **768** | 36 × 36 | 36 px | 32 px | 7 of 7 | none | no |
| **1360** | 36 × 36 | — | 32 px | 7 of 7 | none | no |
| **1600** | 36 × 36 | — | 32 px | 7 of 7 | none | no |

#### Tables at 375 — kept as tables

**No card substitute was introduced.** Both tables already hide non-essential columns below the
medium breakpoint, exactly as the migrated Clientes table does, so a phone shows identity, state and
the action menu. Horizontal scrolling is confined to the table's own region — **the page body never
scrolls sideways** — long names wrap rather than clip, and headers stay readable. **No responsive
composition defect.**

Honest note: the wider trigger adds 8 px to the table's minimum width at phone size, absorbed by the
scroller that was already there.

#### Progress — People reaches none of it

**PROGRESS · PREREQUISITE RECONCILED · CURRENT PEOPLE ROUTE REACH: NONE.** Walking the import graph
of all five routes finds no progress bar of any kind. `CommissionCard` **is mounted nowhere in the
product**, and **it was not mounted here to exercise the new component**. The R6B reconciliation was
still the right prerequisite: it unblocked the family and four real consumers in other groups.

#### Notice — composition verified, API untouched

Reachable in **all five routes**. Tone, hierarchy, density and responsive wrapping were checked and
**nothing was changed**; the status-message regions R6B added were confirmed intact. **No Notice was
added anywhere for visual consistency**, and the Notice API was not reopened.

#### Accessibility

| Check | Result |
|---|---|
| Keyboard traversal | the trigger is a real button inside the menu trigger; row link and action menu sit in **separate cells**, so nothing interactive nests inside anything interactive |
| Menu semantics | untouched — R6D changed geometry only |
| Row semantics | `SellersTable` keeps its named link beside the clickable row; `UsersTable` has no row destination and needs none |
| Focus visibility | unchanged — the shared focus ring |
| Event-propagation protections | **preserved** — the row-activation rules are untouched |
| Semantic headings | **corrected** — see Gate B |
| Empty states | present where reachable |
| Light and Dark | verified; status tones legible in both, title and badge wrap correctly at 375 |

#### Validation

| Check | Result |
|---|---|
| `typecheck` · `lint` · `test` · `build` | **all pass** — 0 errors, same 2 pre-existing warnings, **791 tests / 47 files** |
| `prettier` | clean on every changed file |
| Compiled selectors vs the R6D checkpoint | **0 added · 0 removed** |
| **People palette** | **ZERO** |
| **Core files changed in R6C** | **ZERO** — the one Core change is R6D's, checkpointed separately |
| Method | **PRESENTATIONAL HARNESS QA** at 375 / 768 / 1360 / 1600 in Light and Dark with measured element geometry, plus source inspection, an import-graph walk and document-outline verification in source. **REAL ROUTE QA was not possible** — every People route needs a session and live data, and Supabase is unavailable. **No data-backed validation is claimed** |

#### Intentional visual changes

1. The account state badge appears **next to the name** on both detail pages, and no longer inside
   the contact card. Those cards drop from four fields to three, and from three to two.
2. The row action trigger is **44 px instead of 36 px on phones only**.
3. Five detail-page action buttons are **44 px tall on phones instead of 36 px**.
4. The heading corrections are **visually inert** by construction.

Nothing changes from the small breakpoint upward except the badge's position.

#### Search / Filters

**Not promoted.** People has no free-text search, no filters and no pagination, so it adds no
evidence. `Search / Filters` **remains partially proven**, exactly as R6A predicted.

#### Remaining People debt — both non-blocking

| Debt | Why it was not fixed |
|---|---|
| **TYPOGRAPHY ADOPTION DEBT** — section titles use an ad-hoc type pair instead of the semantic heading role | it is product-wide, identical in an approved rollout, and fixing it here would be visual purity, not accessibility |
| **CODE/STYLE CONSOLIDATION DEBT** — the field-label style is repeated across roughly 18 files | extracting an abstraction to reduce duplication is not this rollout's job |

Plus the finding handed to the Tickets rollout: the two ticket detail pages carry the same
heading-outline shape that Gate B corrected here.

---

### 10.40 R7A — PUBLIC CATALOG THEME & PATTERN AUDIT (2026-09-07 · **COMPLETED AND APPROVED** · commit in §11)

Audit only. **No production file was touched.**

#### The route, and what it actually reaches

| | |
|---|---|
| Route | **`/catalogo/[slug]`** — one page, plus its own not-found screen and a group layout |
| Files reachable | **30**, walked from the route rather than assumed |
| Shared Design System pieces reached | `EmptyState`, `Badge`, `Button`, `Input`, `Label`, and the shared search field |
| **Not** reached | tables, pagination component, Notice, Status badges, every Product Data component, the linear progress bar, the dropdown menu |

**The catalogue theme's reach is exactly one subtree.** The group layout puts the theme class on a
single wrapper and nothing else in the product carries it, so every finding below is scoped to this
page — and, symmetrically, **nothing here can affect Light or Dark**.

#### FINDING 1 — the palette is not zero. The earlier count used the wrong net

The rollout inventory has been reporting **zero palette debt** for Catalog. That number came from
scanning for named colour scales, and this page does not use them: it uses **raw white and black
alphas, and raw colour functions**.

| Shape | Where |
|---|---|
| White alphas as borders — 10 %, 15 %, 20 % | the header, the summary card and its dividers, the pagination buttons, the search field, the footer note |
| White alphas as surfaces — 3 %, 4 %, 5 %, 6 %, 10 % | the same places, plus the summary's decorative bar track |
| A black alpha as a surface | the search field inside the hero |
| A raw colour function as the header background | the sticky header |
| Two raw multi-stop gradients | the seller avatar, and the summary's decorative bar fill |
| Plain white as a text colour | the ticket number and the avatar initials |

**Roughly 14 occurrences across 6 files.** Everything expressed through the semantic roles —
`primary` and `secondary` with alpha, which the ticket card uses correctly — is **fine and not
counted**: an alpha over a *token* is a legitimate composition, an alpha over a *literal* is not.

#### FINDING 2 — the tokens for this already exist, and have never been used

This is the `progress/*` story again. The token layer defines, **in all three scopes**:

| Role | Catalogue-scope value |
|---|---|
| `border/glass` | white at **15 %** |
| `border/glass-strong` | white at **20 %** |
| `surface/glass-subtle` | white at **4 %** |
| `surface/glass-default` | white at **6 %** |
| `surface/glass-strong` | white at **10 %** |
| `brand/gradient-start` · `brand/gradient-mid` · `brand/gradient-end` | the catalogue's own violet-to-lime ramp |

All eight are exposed as utilities. **All eight have ZERO consumers.**

And they line up with the hand-written values almost exactly: 15 % and 20 % borders, 4 %, 6 % and
10 % surfaces. These roles were evidently designed **from this very screen** and then never adopted.
**R7B's palette work is therefore adoption, not invention** — the lowest-risk shape a migration can
have.

The two exceptions are honest ones: the borders written at 10 % have no matching border role (the
roles are 15 % and 20 %), and **the two raw gradients do not match the gradient roles' values**.
Both need a decision rather than a mechanical swap.

#### FINDING 3 — route-local heights on Core controls, at the wrong breakpoint

Three places override a shared control's height locally:

| Control | Override | DS capability that exists |
|---|---|---|
| The "Solicitar" button on every ticket card | 44 px, dropping to 36 px at the **medium** breakpoint | the Button's touch size — 44 px, dropping at the **small** breakpoint |
| Both pagination buttons | same shape, plus hand-written glass colours | same |
| The search field, in both of its placements | a fixed height in the header and another in the hero | the Input's touch size |

This is the **same ad-hoc mechanism R5 removed from Payments**, including the same detail: it changes
at the medium breakpoint while every migrated control in the product changes at the small one. So
adopting the capability is **not visually inert** — it moves the 640–767 band from 44 px to 36 px,
exactly the ledger R5 recorded and approved.

#### FINDING 4 — a shared-component question that is not Catalog's to fix

The shared search field carries its **own ad-hoc touch boolean**, again keyed to the medium
breakpoint. It is reached by **Catalog, Clientes and Tickets**, so it is a shared-primitive question
of the same kind the dropdown turned out to be — **not** something R7B should patch from a route.
Recommended as its own narrow prerequisite if R7B is authorized.

#### FINDING 5 — the summary's bar is decoration, and should probably stay that way

The catalogue summary paints a proportion bar for "reservado". It is **`aria-hidden` on purpose**,
because the same percentage is already written beside it in words — the component says so in its own
comment.

By R6B's classification the *measure* is business completion progress. But the shared progress
component **requires an accessible name and emits a progress role**, so adopting it would add an
announcement that this screen deliberately removed, and it cannot express a gradient fill or the
thinner geometry used here.

**Returned as a decision, not a conclusion.** The reading this audit favours: **a bar that announces
nothing is decoration, not Progress** — the semantic firewall is about what a thing *is responsible
for*, and this one is responsible for nothing an assistive technology should hear. Under that reading
it stays bespoke and simply adopts the glass roles for its track. **Expanding the Progress API for a
decorative mode is the alternative, and it would need its own approval.**

#### FINDING 6 — "Disponible" is written by hand here

The public card renders a plain badge with the word typed inline, rather than the Status family that
owns those eight labels. It is defensible — since D-164 a taken ticket is simply **not published**,
so the card has exactly one possible state and no mapping to make — but it means the canonical label
lives in two places. **A small contract question for R7B**, not a defect.

#### Accessibility and responsive

| Check | Result |
|---|---|
| Landmarks | header, main, and a labelled summary region |
| Headings | **exactly one page title**, in the hero; the not-found screen has its own. No section headings, and on a single-purpose page that is defensible |
| The ticket grid | an unordered list with no accessible name — **an observation**, not a defect |
| Colour never alone | **honoured, and deliberately**: at 375 px and below the availability badge becomes a dot and its word moves to screen-reader-only text rather than disappearing (D-166) |
| Touch targets | the request button and pagination are 44 px on phones — the geometry is right; only the mechanism and its breakpoint are wrong (Finding 3) |
| Reduced motion | the theme scope carries its own reduced-motion rules, and the card's pulse was deliberately removed for performance |
| Empty states | **two**, correctly distinguishing "none left" from "that one is not among the available ones" |
| Loading state | none needed — the page is server-rendered |

#### The Pattern question

| Option | Verdict |
|---|---|
| An instance of an existing Pattern | **No.** It lists things and paginates, but it has no page header, no primary action, no filters, no table, no row actions and no session. Forcing List Page onto it would import responsibilities it does not have |
| A composition that needs no page Pattern | **YES — this is the answer** |
| Evidence for a new recurring Pattern | **No.** It is **one** screen, and a Pattern invented from a single unique surface is taxonomy, not evidence |

**No Pattern is proposed.** If a second public surface ever appears, the question reopens with real
recurrence behind it.

#### Latent Catalog debts — what became reachable

| Previously latent | Now |
|---|---|
| The eight glass and gradient roles | **REACHABLE** — this is the only screen that wants them |
| The shared search field's ad-hoc touch sizing | **REACHABLE**, and shared with two other groups |
| Destructive semantics in the catalogue scope | **still UNREACHABLE** — there is no destructive control on this page, exactly as the token layer's own comment predicts |
| Product Data, Status, Notice, Progress, tables, dropdowns | **still UNREACHABLE** |

**No Light or Dark debt was reopened.**

#### Proposed R7B scope, and its risk

| | |
|---|---|
| Routes | **one** |
| Palette | ~14 occurrences in 6 files → **adopt eight tokens that already exist** |
| Controls | replace three route-local height overrides with the existing touch capability, accepting the documented 640–767 band change |
| Decisions needed **before** implementation | the decorative bar's family, the two unmatched gradients, the 10 % borders, and the hand-written status label |
| Prerequisite | **the shared search field's touch sizing** — a narrow shared-component reconciliation, the same shape as R6D |
| **Risk** | **LOW–MEDIUM.** One route, an isolated theme that cannot affect Light or Dark, and a palette migration that is adoption rather than invention. The medium half is the four contract decisions |

**READY FOR APPROVAL as R7B**, with those four decisions returned first.

#### Dashboards after this preflight

**Unchanged and still deferred.** Two routes, no Dashboard Pattern, 12 of its 15 palette occurrences
concentrated in the lottery card, and several semantic decisions still open. R6B already removed one
of its dependencies by putting both of its progress bars on the shared component. It remains the
strong candidate **after** Catalog, and it still needs its own pattern audit first.

---

### 10.41 R7-PRE — SEARCH INPUT TOUCH RECONCILIATION (2026-09-07 · **COMPLETED** · commit in §11)

The narrow shared prerequisite the Catalog audit asked for, taken **before** any Catalog composition
work. **4 files, no Core API touched.**

#### Consumer audit — both responsibilities are real

| Consumer | Group | Asked for touch | Phone responsibility |
|---|---|---|---|
| `TicketFilters` | Tickets | **yes** | a list a seller works standing up, one-handed |
| `ClientFilters` | Clientes | **yes** | same |
| `CatalogSearch` | Catalog | **yes** in the hero, **no** in the sticky header | a public page opened from a chat link |
| `ClientOptionsPicker` | Tickets | no | a search **inside a dialog**, used sitting down |
| `ClientPicker` | Payments | no | same |

**Five consumers in five files.** Three want the touch height, two deliberately do not — and the
component's own comment already said why. So the answer was **not** "make it always touch": both
responsibilities genuinely exist, and the fix is to give them a proper name.

#### What changed

The ad-hoc boolean is gone. In its place, **the same word the rest of the system already uses**:

| | Before | After |
|---|---|---|
| Public contract | a bespoke boolean | `size`, with `default` and `touch` |
| How the height was applied | **a class pasted over the field**, and another over the button | each control uses **its own capability** |
| Where it changed | at the **medium** breakpoint | at the **small** one, like every other control in the product |

**No Core API was modified.** The field and the button already had the capability; the search field
was reaching past them and setting a height by hand. **AD-HOC TOUCH MECHANISM → REPLACED BY APPROVED
DESIGN SYSTEM CAPABILITY**, the same conclusion R5 reached for the Payments form.

#### The honest responsive ledger

| Width | Before | After | Delta |
|---|---|---|---|
| **375** | 44 px | 44 px | inert |
| **640–767** | 44 px | **36 px** | **the real change** |
| **768+** | 36 px | 36 px | inert |

It affects the three touch consumers — the tickets list, the clients list and the catalogue hero. The
640–767 band is exactly where every other migrated control in the product already sits at 36 px, so
this removes an outlier rather than creating one. **The two dialog searches do not move at all.**

> **One consequence lands in Catalog, and it is left for R7B on purpose.** The catalogue hero also
> carries a local override that pushes its field back to 44 px from the medium breakpoint up. With
> the ramp now changing at the small breakpoint, that override would leave the hero at 44 → 36 → 44
> across widths. **The height decision belongs to the Catalog composition**, not to this prerequisite,
> and R7B resolves it.

#### An observation, not a change

The two in-dialog searches render **36 px at every width, including phones**. That is the documented
intent — a dialog is used sitting down — but it is worth recording that the product does have two
sub-44 px text fields on phones. **Nothing was changed**: reclassifying them is a product decision,
not a mechanism cleanup.

#### Validation

| Check | Result |
|---|---|
| `typecheck` · `lint` · `test` · `build` | **all pass** — 791 tests / 47 files, same 2 pre-existing warnings |
| The old boolean | **zero occurrences left in the repository** |
| Core files changed | **ZERO** |

The Catalog file in this commit is the **call site of the renamed property only**. No Catalog colour,
layout or composition work rides along; that is all R7B's.

---

### 10.42 R7B — PUBLIC CATALOG MIGRATION (2026-09-07 · **COMPLETED AND APPROVED** · commit in §11)

**6 production files, zero Core files, zero new tokens.** And the first rollout in this migration
validated on the **real route**, with live data.

#### REAL ROUTE QA — finally possible

Supabase was running this session. A local catalogue was published for a seller who had **3 317
available and 327 taken** in an active raffle, the route was driven at six widths, and **the local
data was reverted afterwards**. The three fields set and cleared are recorded here so nothing is
left behind: the public slug, the enabled flag, the WhatsApp number and the published raffle, on one
membership row of the **local development database only**.

**This is REAL ROUTE QA**, not a harness. Every measurement below comes from the rendered page.

#### The bug only the real route could find

The first render came back **green**. The summary bar's gradient, written as an arbitrary value
referencing the `--color-*` names, resolved to the **Light** brand green inside the catalogue theme.

The cause is worth writing down, because it is invisible in source review:

| | Behaviour |
|---|---|
| A Tailwind **utility** | compiles to `var(--ds-…)`, which **each theme scope redefines** — so it follows the catalogue |
| A **`--color-…` reference written by hand** | is emitted on the root, where it substitutes the **Light** value and then inherits down as an already-computed value — so it **ignores the scope** |

**Rule, now proven on a live page: inside an arbitrary value, reference `--ds-…`, never `--color-…`.**
Three places were affected — both gradients and the card's inset highlight — and all three now
resolve correctly: the bar runs brand violet to light violet, and the avatar violet to its dark tone.

> A second measurement of mine was also wrong, and it is worth recording so nobody chases it again.
> Buttons briefly measured 44 px at desktop widths. They were mid-transition: these controls carry a
> transition on all properties, and the viewport had just been resized under them. **Measured on a
> clean load, every width is correct.** Resize-then-measure is not a valid method for this page.

#### FINDING 1 corrected — the palette inventory

The rollout inventory reported **Catalog palette = ZERO**. It was wrong, and the reason is recorded
rather than quietly fixed: the scan looked for **named colour scales**, and this page uses raw white
and black alphas, raw colour functions and raw gradients. The real count was **14 occurrences in 6
files**. The same broad scan run against Dashboards returns the same number it already had, so **the
error was specific to Catalog**.

#### The summary bar — traced, then classified

The audit guessed "decorative because it announces nothing". **That reasoning was wrong**, and the
correction stands on the trace:

| Question | Answer |
|---|---|
| Data source | the published catalogue's two counts; the total is their sum |
| Width | `taken ÷ total`, rounded and clamped, applied as the fill's width |
| Colour | **static** — it does not vary with data |
| Does the width move with product data | **YES** |
| 0 means | nothing published has been taken |
| 100 means | everything published has been taken |
| Composition of categories? | no — one part of one whole, with the remainder as the track |
| Static? | **no** |

**CLASSIFICATION: BUSINESS COMPLETION PROGRESS.** The same family R6B gave the two
collected-over-sold bars, and reached the same way: a proportion advancing toward a terminal state.
It is **not** decorative data, not Product Data composition, not Status and not brand presentation.
**The R7A "decorative" reading is rejected.**

##### The family owns the colours; the component does not own the markup

Two questions that look like one, and the closure separates them:

| | Answer |
|---|---|
| **Which semantic family owns this bar?** | **Progress.** It now consumes `progress/track` and `progress/value` — **not** the data roles, not a status family, and **not the brand gradient roles it briefly borrowed** |
| **Must it therefore be the shared component?** | **No.** Component adoption follows the **accessibility responsibility**, not the data semantics alone |

The bar sits beside text that already says **what is measured and its exact value** — "43 %,
reservado". The drawing is therefore a **redundant visual representation of progress that has already
been communicated**. `LinearProgress` exists to *announce* an advance that nothing else states; here
it would either announce the same fact twice or force a silent mode into the shared contract.

**So: the bar keeps its small local markup, stays hidden from assistive technology, and the adjacent
text remains the carrier of the meaning.** `LinearProgress` was **not weakened**: no decorative,
silent or presentation-only option was added to it from this one consumer.

> Recorded as a general rule, because it will come up again: **a data-driven progress measure does
> not oblige the shared progress component.** What obliges it is being the *only* thing that
> communicates the value.

##### The gradient was the wrong family, and it is gone

R7B first adopted the two brand ramp roles for the fill, because they matched the hand-written stops
almost exactly. Once the trace proved Progress ownership, that match stopped being a reason:
**numeric similarity is not semantic authority**. The fill is now the solid `progress/value`.

**APPROVED SEMANTIC VISUAL CORRECTION — BRAND PRESENTATION → BUSINESS COMPLETION PROGRESS.** The bar
changes from a violet-to-light-violet ramp to a solid brand violet on a dark track, verified on the
live route: track `#0b0717`, fill `#843bec`, width matching the printed percentage exactly.

**No `progress/gradient-*` role was invented.** And the brand ramp roles return to **zero consumers**
— which is accepted: usage count is not an argument about correctness.

#### Glass roles — adopted by layering responsibility

| Catalogue layer | Responsibility | Role adopted |
|---|---|---|
| Sticky header background | the page's own ground, translucent | the background role at 94 % |
| Header and summary boundaries, section dividers, footer note border | glass boundary | `border/glass` |
| Search field boundary, both placements | a stronger glass boundary on a field | `border/glass-strong` |
| Summary card, footer note | the faintest glass plate | `surface/glass-subtle` |
| Pagination buttons, header search field | a normal glass plate | `surface/glass-default` |
| Pagination hover, the summary bar's track | the strongest glass plate | `surface/glass-strong` |
| Hero search field | **a scrim** — a veil so text stays legible over an illustration | `overlay/scrim`, whose value is within a percent of the hand-written black |
| Ticket card's top highlight | a glass edge | `surface/glass-default` |

**Eight roles that had zero consumers now have them.** No parallel family was invented.

#### The 10 % borders

Confirmed as glass boundaries — the summary card's outline, its dividers, the header's underline and
the footer note. They **adopt `border/glass`**, which resolves at 15 %.

**APPROVED SEMANTIC ADOPTION WITH SMALL VISUAL CORRECTION.** The boundaries are marginally more
visible; verified on the real route at every width. **No extra-subtle glass role was invented from
one historical opacity.**

#### The two gradients

| Gradient | Measured against the existing roles | Decision |
|---|---|---|
| **The summary bar** | its two stops landed on the brand ramp — but the trace later proved **Progress** owns this bar | **SUPERSEDED.** The fill is the solid `progress/value`; see the closure above |
| **The seller avatar** | no role matches: its stops sit between the brand default and its dark tone | **Structure stays local, colours become semantic** — brand default to brand hover. **No new gradient token was created** |

#### "Disponible" — availability is an operational status

Traced: since D-164 a taken ticket is **not published at all**, so a published card has exactly one
state, and it means *this number can still be chosen*.

**CLASSIFICATION: AVAILABILITY / OPERATIONAL STATUS → the SUCCESS family.** It was previously painted
with the brand's secondary accent, which is the generic brand green the contract warns against.

The composition is **preserved exactly** — this is not a status badge imported wholesale:

| | |
|---|---|
| Above 376 px | the pill keeps its shape, now on the success surface, text and border |
| At 376 px and below | still the 8 px dot in the corner, now the success **icon** role so it stays visible, with the word in screen-reader-only text |
| Colour alone | the word is always in the accessibility tree (D-166 untouched) — but see the classification below |

Measured on the real route: the pill is **66 × 18** above the breakpoint and the dot **8 × 8** below
it, with the word absolutely positioned out of view. Contrast: **11.87 : 1** for the text on its
surface, and **9.82 : 1** for the dot against the card.

##### The phone dot, classified precisely

It would be wrong to write "the dot is not colour-only because screen-reader text exists" — a visible
dot **is** a colour-only visual cue, and hidden text does not change what a sighted person sees.

**MOBILE AVAILABILITY DOT → REDUNDANT VISUAL CUE.** It is acceptable **not** because of the hidden
word, but because **membership in this collection already establishes eligibility**: since D-164 a
taken ticket is not published at all, so every card on the page is selectable. The dot is not the
sole carrier of a state that distinguishes one card from another — there is nothing to distinguish.

**The condition is explicit, and it is the thing to watch.** The moment the visible grid mixes
states — available beside taken, blocked or unavailable — the dot alone stops being sufficient and a
**visible, non-colour** representation must return. **No visual change is required today.**

#### The three local control heights — removed

| Control | Before | After |
|---|---|---|
| The request button on every card | a hand-written 44 px dropping at the **medium** breakpoint, over a small size | the button's **touch** capability |
| Both pagination buttons | the same, plus hand-written glass colours | the same capability, plus the glass roles |
| The search field, both placements | one fixed height in the header and another in the hero, fighting the shared ramp | the field's **touch** capability in both |

**No new API, no route breakpoints, no local heights left.** Measured on the real route:

| Width | Grid | Badge | Request button | Search field | Page scrolls sideways |
|---|---|---|---|---|---|
| **320** | 2 columns | dot | **44 px** | **44 px** | no |
| **375** | 2 | dot | **44 px** | **44 px** | no |
| **640** | 3 | pill | **36 px** | **36 px** | no |
| **768** | 3 | pill | 36 px | 36 px | no |
| **1360** | 4 | pill | 36 px | 36 px | no |
| **1600** | 5 | pill | 36 px | 36 px | no |

The honest deltas: the request and pagination buttons now step down at 640 instead of 768, and the
hero and header search fields — previously pinned at 44 px and 40 px at **every** width — now follow
the same ramp. At 320 and 375 the ticket number is not clipped and nothing overflows the page.

#### The ticket grid's accessible name — NO DEFECT

It is a plain list of list items: no grid role, no listbox, no landmark, no widget semantics. Each
item is self-describing — the daily number is announced with its label, the weekly number with its
own, the state as a word, and the action names both numbers. **A collection name is not required, and
none was invented.**

#### Empty and loading states — unchanged

The two empty states remain distinct and were **not** renamed into list-pattern vocabulary: this page
has no entity-management contract. The page is server-rendered and owns no loading responsibility;
the only pending affordance is the search field's own, which already exists. **No skeleton was added
because another Pattern requires one.**

#### Final raw-colour audit

**ZERO.** No raw hex, no colour functions, no white or black alphas anywhere in the catalogue route
or its feature tree. Nothing was intentionally retained.

The compiled selector comparison says the same thing from the other side: every raw selector removed,
and in its place the semantic role utilities. **No new token was created.**

#### Validation

| Check | Result |
|---|---|
| `typecheck` · `lint` · `test` · `build` | **all pass** — 791 tests / 47 files, same 2 pre-existing warnings |
| `prettier` | clean; the two remaining objections are **pre-existing at HEAD**, on lines R7B did not touch |
| Console errors on the live route | **none** |
| **Catalog raw colour** | **ZERO** |
| **Core files changed** | **ZERO** · **new tokens: ZERO** · **new page Pattern: ZERO** |
| Method | **REAL ROUTE QA** at 320 / 375 / 640 / 768 / 1360 / 1600 with live data, plus source validation. The catalogue theme is the page's own scope, so this *is* its theme validation |
| Light and Dark | **SOURCE VALIDATION only.** The shared search field changed in R7-PRE; that change touches **height, not colour**, and its only behavioural delta is the breakpoint already recorded. Its non-catalogue consumers need an authenticated session, which was not exercised |

#### Intentional visual changes

1. **Availability is green-on-dark instead of a bright lime pill.** The word and the dot are
   unchanged in behaviour; the family is now Success rather than the brand accent.
2. **Glass boundaries are slightly more visible** — the 10 % borders resolve at 15 %.
3. **The request and pagination buttons step down at 640 instead of 768.**
4. **The two search fields now follow the touch ramp** instead of being pinned at 44 px and 40 px.
5. Everything else — the summary bar's ramp, the avatar, the header, the card — **looks the same**;
   only the values' provenance changed.

#### Remaining Catalog debt

* Two **pre-existing** formatting objections in files R7B touched, left alone deliberately.

Nothing else: **both semantic closures are decided and implemented.**

---

### 10.43 DASHBOARDS — PREFLIGHT REFRESHED (2026-09-07 · preview only, **NOT AUTHORIZED**)

Re-counted against HEAD after Catalog, not carried forward.

| | |
|---|---|
| Routes | **2** — `owner/dashboard`, `seller/dashboard` |
| Palette | **15**, and the broad scan that corrected Catalog returns **the same 15** here, so this count is trustworthy |
| Concentration | **12 of 15 in the lottery results card**, 1 in its section wrapper, 1 in the recent-activity card, 1 in the seller route |
| Components | **9 dashboard pieces** plus **3 lottery pieces** |
| Progress reach | **already reconciled** — R6B put both dashboard bars on the shared component. Nothing to decide |
| Product Data reach | the trend chart, the donut and the metric cards, all on approved roles from Wave 6. **Not to be reopened** |
| Table-action debt | **not reachable** — neither dashboard has a table with row actions |
| Search / Filters | not reachable |
| **Missing contract** | **no Dashboard Pattern exists** |

#### Semantic decisions still open

1. **What family owns a published lottery result** — the number, its provenance line, the
   pending-versus-played states and the schedule badge. Twelve of the fifteen palette occurrences are
   this one question.
2. **What the recent-activity card's tinting means**, and whether it is Status or Product Data.
3. Whether the seller dashboard's single occurrence belongs to either of the above.

#### Proposed scope

**R8A — DASHBOARD PATTERN & SEMANTIC AUDIT**, audit only: define what a Dashboard Page is responsible
for, and settle the lottery-presentation question, **before** any route is migrated. Then **R8B**.

**Risk: MEDIUM with the audit first, HIGH without it.** Two routes is small, but they are the only
routes in the product with no Pattern behind them and an unowned semantic family inside them.

---

### 10.44 R8A — DASHBOARD PATTERN & SEMANTIC AUDIT (2026-09-07 · **AUDIT COMPLETE, AWAITING DECISION** · no production change)

Audit only. **No production file was touched.** The headline: the semantic gap is **much smaller than
the preview assumed** — twelve of the fifteen palette occurrences are adoption debt against families
that already exist, and the genuinely unowned question is a single one.

#### Routes and reach

| Route | Lines | Shape |
|---|---|---|
| `owner/dashboard` | 233 | page header, one conditional notice, install offer, lottery block, a collection summary, then **three titled sections and two recent-activity tables** |
| `seller/dashboard` | 246 | page header **with a period selector**, one conditional panel, catalogue card, install offer, lottery block, then **a card grid with explicit ordering** (D-112) |

**They are not two instances of one layout.** The seller route was redesigned into cards; the owner
route still composes titled sections around the **raw table primitive** — not the shared data table,
so it has no responsive column hiding and no row activation.

Shared dashboard components: **9** (`KpiCard`, `SellerKpis`, `CollectionStatusCard`,
`CollectionTrendCard`, `FinancialSummaryCard`, `TicketsOverviewCard`, `RecentActivityCard`,
`QuickActionsCard`, `DateRangeSelect`) plus **3** lottery pieces.

#### Palette — verified with the broad scan, not assumed

**15 occurrences in 4 files**, matching the preview: 12 in the lottery results card, 1 in its section
wrapper, 1 in the recent-activity card, 1 in the seller route. Every one classified by responsibility:

| Count | What it colours | Traced meaning | Classification |
|---|---|---|---|
| **6** | the results card's two roles — blue for a draw still to come, green for one already played | the card's **temporal role**, decided by whether a number has been published | **ADOPTION DEBT** |
| **2** | two schedule-notice panels | a contextual message about the calendar | **ADOPTION DEBT** → Notice, warning |
| **1** | the conflict panel | the sources disagree, so **no number is shown** | **ADOPTION DEBT + a tone decision** |
| **2** | the coincidence strip, in its two intensities | the reader's tickets carry the published number | **PRODUCT DECISION** |
| **2** | the lottery ticket icon, in the card and in its loading skeleton | identity tint of the lottery block | **ADOPTION DEBT** |
| **1** | an active payment's amount in recent activity | the record is not voided | **PRODUCT DECISION** |
| **1** | the seller's pending-approval panel | **the same message the owner route already renders with Notice** | **ADOPTION DEBT** |

**12 adoption debt · 3 product decisions**, and two of the three are the same question.

#### The lottery card's two roles already have an owner

The card hand-writes blue and green for "coming" and "played", and its own comment admits where they
came from: the families that its sibling badge uses. **That badge already consumes the shared status
tones** — a documented, approved mapping in which a completed draw is `success` and a scheduled or
rescheduled one is `info`.

So the card is repeating, as literal colours, a mapping the system already owns one component away.
**Not a gap: adoption.** The three slots it needs — a pill, an icon chip and a large value — map onto
the surface, icon and text roles those tones already provide.

> **A trap worth naming.** The schedule conflict and the **result** conflict are different things in
> different fields; the badge's own comment says so. R8B must not merge them.

#### The genuinely unowned question — a coincidence is not an outcome

When a published number matches tickets the reader holds, the card paints a green strip, stronger
when there are matches. That is the one thing no family owns, and the reason is a business rule, not
a styling gap:

* **BR-L15 and the copy guide forbid calling it a win.** The product detects a **numeric
  coincidence** and certifies no prize. The word on screen is "coincidencia", never "ganador".
* **Success would say the opposite.** Painting it with the success family asserts a good outcome the
  product explicitly refuses to assert.
* It is **not Status** — it is not the state of an entity in this system; the draw belongs to a
  lottery, and the tickets' own status is unchanged by it.
* It is **not Product Data** — nothing is decomposed.
* It is **not Progress** and it is **not decorative** — it is the only line on the card that can
  oblige someone to act.

**RETURNED AS A NEW SEMANTIC GAP: RESULT / OUTCOME PRESENTATION.** No token was invented. The
decision to make is whether this responsibility earns a family of its own, or whether it is
Notice-with-emphasis wearing an unusual colour. **Two occurrences on one card is thin evidence for a
new family**, and that is exactly why it is returned rather than settled.

#### The recent-activity amount — a real fork, with a recommendation

The amount of an **active** payment is green; a **voided** one is muted and struck through, with the
word "anulado" leading the line beneath it, so colour is not carrying it alone.

| Reading | Argument |
|---|---|
| **Product Data — money collected** | the figure **is** collected money, and the product already has a text-safe role for exactly that, used by the payment allocation cards and the ticket payment summary |
| Status — success | an active payment is the **normal** state, not a success. The product maps a cancellation to neutral, not a failure |

**Recommendation: Product Data.** It puts the same money in the same colour everywhere, which is the
principle the seller dashboard's own tone file already states. **Not migrated**, per the audit's
scope.

#### Progress — compliant, and one bar that must NOT become Progress

| Consumer | Verdict |
|---|---|
| `CollectionSummaryCard` (owner) and `SellerKpis` (seller) | **COMPLIANT** — both consume the shared linear progress since R6B |
| **`CollectionStatusCard`'s bar** | **PRODUCT DATA, not Progress** |

That last one matters. It looks like a progress bar and is not: it is a **stacked, multi-segment bar**
that splits money sold across payment categories, carries an image role and an accessible label
listing every category's share. **A decomposition, not an advance.** The firewall holds, and R8B must
not "unify" it with the progress component.

#### Product Data — already adopted, and better than expected

The seller dashboard's colour meanings live in **one tone file** that already maps every meaning to
the Wave 6 roles, in **two variants**: fill roles for drawn shapes and text-safe foreground roles for
written figures. The donut, the trend chart, the stacked bar and the written amounts all read from
it. The trend arrows use the positive and negative data roles.

**Nothing to reopen.** `data/paid`, `data/partial`, `data/unpaid` and `data/pending` stay as approved,
including the deliberate choice not to paint "pending" in the alarm colour.

#### Metric and chart components

| | Finding |
|---|---|
| Metric | `KpiCard` wraps the shared metric card; the owner route uses it directly. **Compliant** |
| Chart / Line | consumed by the trend card. **Compliant** |
| Chart / Donut | consumed by the financial summary. **Compliant** |
| Gap | **none.** No second metric or chart family is needed, and no dashboard needs a chart it does not have |

#### Pattern — does Report Page own this?

| | Report Page | The dashboards |
|---|---|---|
| Intent | the user **chooses an analysis and a scope** to answer a specific question | **ambient operational state**, several responsibilities at once, chosen by nobody |
| Entry | deliberate — you go there with a question | it is where the role **lands after signing in** |
| Scope control | central to the pattern | absent on the owner route; on the seller route a period selector governs **only** the money region, while inventory and collection stay "today" (D-112) |
| Output | one table plus export | many small regions, each drilling through to the list that owns it |

**Report Page does not own Dashboard**, and forcing it would import a scope selector as a required
responsibility onto a route that correctly has none.

#### Pattern candidate — justified, and deliberately not formalized

Both routes share a shape no existing pattern covers: **an at-a-glance operational summary for one
role, with conditional alerts and drill-through to the lists that own the detail.**

**NEW PATTERN CANDIDATE: `Pattern / Dashboard Page`.** Minimum responsibility-backed contract, drawn
from what the two routes actually do:

| Region | Status | Evidence |
|---|---|---|
| Role context header | **REQUIRED** | both greet the person and name their organisation or period |
| Summary metrics | **REQUIRED** | both, and both group them under titled sections or cards |
| Drill-through | **REQUIRED** | every region links to the list that owns its detail |
| Conditional urgent notice | **OPTIONAL** | both have one, for the same fact, expressed differently |
| External context block | **OPTIONAL** | the lottery block, on both, behind its own loading boundary |
| Trend or composition visualisation | **OPTIONAL** | seller only |
| Recent activity | **OPTIONAL** | both, in different shapes |
| Quick actions | **OPTIONAL** | seller only |
| Install offer | **OPTIONAL** | both |
| **Period selector** | **NOT PART OF THE PATTERN** | one route, governing a subset of its own regions |

**Not formalized here, and no component was created.** Two routes is the minimum evidence a pattern
can have, and they diverge structurally — which is an argument for defining the contract carefully,
not for skipping it.

#### Responsive and accessibility — source validation only

**Real route QA was not possible for Dashboards.** Both routes require an authenticated session, and
signing in is not something this agent does. The catalogue could be validated live because it is
public; these cannot. **No route-rendered measurement is claimed.**

| Check | Source finding |
|---|---|
| Heading outline | **seller: correct** — all six cards already wrap their title in a real heading. **Owner: correct too**, its sections use real headings, though with the same ad-hoc type pair Gate B left as debt |
| The stacked bar | image role with a label naming every category and its share — **colour is not alone** |
| Trend direction | uses the positive and negative data roles **plus** an arrow icon |
| Recent activity | a voided payment says "anulado" in words, leading the line |
| Owner tables | the **raw table primitive**: no responsive column hiding, no row activation, no caption. At phone widths this is the least-verified composition on either route |
| Quick actions | already carry a 44 px minimum target |
| Empty and loading | the lottery block has its own loading boundary and copy; the rest render from one query |

**The owner tables are the one responsive risk**, and it is a risk, not a finding: it needs a rendered
route to confirm.

#### Gaps, classified as the contract requires

| Category | Items |
|---|---|
| **PATTERN GAP** | one — no Dashboard page contract exists. Candidate above |
| **COMPONENT GAP** | **none found.** Metric, both charts, progress, notice and status all exist and are reachable |
| **SEMANTIC TOKEN GAP** | **one candidate** — result/outcome presentation, and it may resolve to "no new family". No token invented |
| **ADOPTION DEBT** | 12 palette occurrences; the seller's pending-approval panel duplicating a message the owner route already renders with the shared notice; the owner route's ad-hoc section typography; the owner route's raw tables |
| **PRODUCT DECISION** | two: what a coincidence strip is allowed to look like, and whether an active payment's amount is Product Data or Status |

#### Proposed shape

**R8B is not ready.** Two prerequisites, in this order:

1. **R8B-PRE-1 — `Pattern / Dashboard Page` contract**, returned above for approval.
2. **R8B-PRE-2 — the result/outcome decision**, which governs 2 of the 15 occurrences and must be
   settled against BR-L15 before anything in that card is repainted.

Then **R8B — DASHBOARD MIGRATION**: two routes, 15 occurrences of which 12 are mechanical once the
two decisions land, plus the notice adoption and the owner table question.

**Risk: MEDIUM.** Lower than the preview feared — the component and token systems are already in
place and the seller route is largely compliant — but it is the first group needing a **new page
contract**, and it contains the product's only unowned semantic family.

#### Pattern maturity, current

| Pattern | Status |
|---|---|
| List Page | **PROVEN** — Clientes ×2, Raffles, Payments ×2, People ×3 |
| Detail Page | **PROVEN** — Clientes ×2, Raffles, People ×2 |
| Form | **PROVEN** — Clientes, Raffles, auth, Payments |
| Focused System State | **PROVEN** — `/denied`, `/offline` |
| Report Page | **PROVEN** — both report routes |
| Search / Filters | **PARTIALLY PROVEN** — People added none, Catalog exercised the shared field but not filters |
| Bulk Selection | **UNPROVEN** — reachable only in Tickets |
| **Dashboard Page** | **CANDIDATE — awaiting a contract decision.** Not defined, not proven |
| Public composition (Catalog) | **no pattern, deliberately** — one unique screen |

---

### 10.45 CLOSURE MODE (2026-09-07 · **APPROVED**)

From here the objective changes. It is **no longer** to discover every possible abstraction; it is to
**close** the system: real semantic gaps shut, reusable composition rules written down, the important
product areas migrated, and the foundations left flexible enough that a visual representation can be
swapped later without redesigning anything underneath.

Every finding is now one of two things, and **only the first may stop a rollout**:

| | |
|---|---|
| **A · CLOSURE BLOCKER** | a semantic responsibility with no approved owner · unresolved raw palette · a serious shared-component defect · structurally inaccessible content or interaction · an unusable responsive composition · a missing required page Pattern · business meaning that cannot be inferred safely · architecture that welds business behaviour to one presentation so tightly that a required responsive representation cannot be built |
| **B · NON-BLOCKING DEBT** | local typography inconsistency · small visual differences · refactor opportunities · duplicated styles with no behavioural effect · future extraction opportunities · a Figma sync blocked by tooling · a presentation choice that can be swapped later under an existing contract |

**Category B does not stop product rollout.** It is recorded and carried.

---

### 10.46 RESPONSIVE COLLECTION PRESENTATION (2026-09-07 · **APPROVED COMPOSITION GUIDELINE**)

The architectural point first, because it is the one that has to survive: **what a collection *is*
must not depend on how it is drawn.**

Entity fields, status, actions, permissions, pagination, filters, selection and navigation are
**business responsibility**. Table, priority table and cards are **presentation strategy**. A screen
may change strategy without any of the first list changing.

**This is a guideline, not a component.** There is no universal collection renderer, and none is
planned: the boundary is documented and preserved, not enforced by an abstraction.

#### The three approved strategies

| | Use when | Already evidenced by |
|---|---|---|
| **A · Responsive cards** | each record stands on its own through identity, state, a few priority values and its actions | the clients and tickets phone lists; the team grid; the dashboards' recent-activity lists |
| **B · Priority table** | comparing rows still helps, the essential columns fit, and lower-priority ones can drop below a breakpoint | Raffles, Clientes, People |
| **C · Scrollable table** | comparing **across** columns is the point, hiding any would remove context, and cards would damage the task | Reports; the owner dashboard's seller summary |

#### The default, and its limit

**For new mobile entity collections, responsive cards are the default.** Choose a table strategy when
responsibility gives a reason: comparison that matters, or columns that must stay together.

**This does not oblige anyone to rewrite a working table.** A table that passes responsive closure
stays as it is; migrating it to cards purely to satisfy the default is category B work and is not
authorized by this guideline.

#### Two rules that come with the strategies

* **Scroll belongs to the table, never to the page.** If a scrollable table is chosen, the horizontal
  overflow lives in the data container; the heading, context and actions stay outside it, and **the
  page itself must not scroll sideways**.
* **A card carries the same responsibility, not the same density.** It must preserve identity, state,
  the two to four values that matter and the actions that are required. Lower-priority desktop
  columns may simply be absent. **Business logic is never duplicated between the two
  representations** — both read the same prepared feature data.

#### Table actions, settled

The distinction proved across Payments and People is now a composition rule: **a child affordance
that duplicates row navigation** may leave the primary target to the row, while **a child that
performs an independent action owns its own target**. Touch-target decisions follow interaction
responsibility, not table geometry. **No further product-wide table-action audit is required.**

---

### 10.47 PATTERN / DASHBOARD PAGE (2026-09-07 · **FORMALIZED AND APPROVED** · DEFINED, awaiting implementation evidence)

#### Purpose

**An at-a-glance operational overview across several product responsibilities, which the reader
reaches without first choosing anything.**

That last clause is the whole distinction from the report pattern:

| | Report Page | Dashboard Page |
|---|---|---|
| How you arrive | deliberately, carrying a question | it is where your role lands after signing in |
| What you choose first | an analysis and its scope | nothing |
| What it answers | one question, thoroughly | several, shallowly, with a way into each |
| Output | one result set, exportable | independent regions, each drilling through to the list that owns it |

#### Required responsibilities

| | |
|---|---|
| **Role context** | the reader knows whose overview this is — their name, their organisation, or the period the figures cover |
| **At-a-glance summary** | the figures that answer "how are we doing" without opening anything |
| **Priority hierarchy** | the independent regions are ordered, and the order means something |

**These are responsibilities, not slots.** The pattern requires **no** card grid, no table, no chart
and no particular number of metrics.

#### Optional responsibilities

Drill-through · an urgent contextual notice · external or contextual information · a visualisation ·
operational progress · recent activity · quick actions.

**Optional means absent when there is nothing to say.** No region reserves empty space.

#### Explicitly not part of Dashboard v1

A global analysis selector · a global date range · a fixed chart type · a fixed table type · CRUD
architecture · a promotional or install offer.

The seller route's period selector stays **local to its money region** — it governs what was
collected, while inventory and cobranza remain today's picture (D-112). The install offer is product
content that happens to live here; it is not pattern anatomy.

#### Implementation rule

**No `DashboardPage` component exists and none will be created**, and the two routes are **not** forced
into one layout. The separation is deliberate and it is the same one the rest of this system uses:

> **Patterns own responsibility. Components own reusable visual and behavioural units. Routes own
> product composition.**

The owner route composes titled sections around a scrollable summary table; the seller route composes
an ordered card grid (D-112). **Both satisfy the pattern.** That they look different is evidence the
contract is about responsibility, not layout.

#### Figma

**CONTRACT APPROVED · CODE/PRODUCT EVIDENCE IMPLEMENTED · FIGMA SYNC PENDING — tooling limitation.**
The connected Figma operations are read-only for this kind of write. Recorded, not hidden, and **not
a blocker**. It joins the Notice density axis, which remains separately pending design-owner sync.

---

## 11. Repository checkpoint — 2026-09-07

| Item | Value |
|---|---|
| Migration branch | **`design-system/migration`**, branched from `main` @ `124445b` |
| Branch point | `124445b941f0b7fec5fe0e587de25a632e58a82c` — `docs: registrar D-170 aplicada y desplegada en produccion (0049)` |
| **Wave 1 commit** | **`3aae86793174077ec3b1d8022a18400705ad21b5`** (`3aae867`) — `feat(design-system): add semantic token infrastructure` |
| Wave 1 commit contents | `src/app/globals.css`, `docs/design-system/RIFAS_DESIGN_SYSTEM_HANDOFF.md` — **nothing else** |
| **Wave 2 commit** | **`b33003e1a6f0ffe58159d64e71aa9de0f94abaa8`** (`b33003e`) — `feat(design-system): adopt semantic typography roles`, 20 files |
| **Wave 3A commit** | **`c723b9983d6c7a6980079a22f7679ae393b164d6`** (`c723b99`) — `feat(design-system): adopt semantic core controls`, 8 files |
| **Wave 3B1 commit** | **`64aaeed9e416461f05c08f27b40584d005b5e233`** (`64aaeed`) — `feat(design-system): converge brand semantic roles`, 12 files |
| **Wave 3B1b commit** | **`64f22c5984800e2b3d96946e3291a2b1b3420574`** (`64f22c5`) — `chore(design-system): prepare brand activation semantics`, 2 files |
| **Wave 3B2 commit** | **`7a851f88a9a0a8ae88e00928b70d50a38197c681`** (`7a851f8`) — `feat(design-system): activate Rifas brand semantics`, 9 files |
| **Wave 4 commit** | **`e48e2c8e86bc8d94ee6ec3329fe1cc9a95cf0cff`** (`e48e2c8`) — `feat(design-system): adopt data display and overlay semantics`, 9 files |
| **Wave 4.5A commit** | **`dbba15141753daa16592352562e35a087dd0e0ac`** (`dbba151`) — `docs(design-system): approve product status semantics`, documentation only |
| **Wave 4.5B commit** | **`85fc38f7d726aad86cf47947397e70e041e84086`** (`85fc38f`) — `feat(design-system): migrate product statuses to semantic tones`, 10 files |
| **Wave 5 preflight commit** | **`6787298fc38fb85438b413ac6fdcae766a3d8dc3`** (`6787298`) — `docs(design-system): record re-scoped wave 5 preflight`, documentation only |
| **Wave 5 commit** | **`9ac0740b11662caf4d3542ffb58bb8591b0f89cb`** (`9ac0740`) — `feat(design-system): adopt semantic application shell`, 3 files |
| **Wave 6 commit** | **`2d8e4ac989f2180d29dd30cb89659e24ad9f2267`** (`2d8e4ac`) — `feat(design-system): adopt semantic product data visualization`, 11 files: the token layer, 9 consumers and this handoff |
| **Wave 6.5A commit** | **`ddd147acd73100b2250bccbcbcbe869a540f5ba0`** (`ddd147a`) — `docs(design-system): define inline notice contract`, this handoff only |
| **Wave 6.5B commit** | **`ab9549c0f500d86f19704623b99e92ee47b8ea59`** (`ab9549c`) — `feat(design-system): add semantic inline notice`, 6 files |
| **Wave 6.6 commit** | **`05848c51d77bab52e72e4a0c845aa05e5c9daea3`** (`05848c5`) — `feat(design-system): reconcile pilot accessibility controls`, 10 files |
| **Wave 7 commit** | **`4232028a872c77bc675ebc6294672d15842354e8`** (`4232028`) — `feat(design-system): complete clientes seller pilot`, 5 files |
| **Rollout preflight commit** | **`bf44fe3d2ca3ff950c51ee8aeaa19a3d5d3b360d`** (`bf44fe3`) — `docs(design-system): record post-pilot rollout plan`, this handoff only |
| **Rollout R1 commit** | **`606bd8ca3606c8a4f0bfb68575c593981b3d03ad`** (`606bd8c`) — `feat(design-system): migrate owner clients to proven patterns`, 2 files |
| **Rollout R2 commit** | **`9eada2dd59b8917423e11af73b7ba99f01b36381`** (`9eada2d`) — `feat(design-system): migrate raffles to proven patterns`, 3 files |
| **Rollout R3 commit** | **`cb9b25fa7befd69259e75656be301a9e79d280fb`** (`cb9b25f`) — `feat(design-system): migrate auth and utility flows`, 8 files |
| **R4A commit** | **`eb6c2f78fcb9d2a7c3576d591273c65a3e279390`** (`eb6c2f7`) — `docs(design-system): define report page pattern`, this handoff only |
| **R4B commit** | **`1ea836d49ae851e114da6675298ff34956159fd3`** (`1ea836d`) — `feat(design-system): migrate reports to report page pattern`, 3 files |
| **Rollout R5 commit** | **`836cf5bf6ff6fa30d8549cc99f94f94d6b2b45a2`** (`836cf5b`) — `feat(design-system): migrate payments to proven patterns`, 4 files |
| **R6A commit** | **`7584f1b8fc3e71071ff4ddfda11350c3040c4d9f`** (`7584f1b`) — `docs(design-system): define people rollout prerequisites`, this handoff only |
| **R6B commit** | **`be127a09660d59cb21fae5e2343d0140ef6f405d`** (`be127a0`) — `feat(design-system): reconcile notice density and linear progress`, 10 files: `components/data/LinearProgress.tsx` (new), `components/feedback/Notice.tsx`, 7 consumers and this handoff |
| **R6D commit** | **`5a5917a038b44144a6019937daa0ec39b9abee34`** (`5a5917a`) — `fix(design-system): make dropdown actions touch-safe`, 2 files: `components/ui/dropdown-menu.tsx` and this handoff. A People prerequisite, checkpointed **before** the People route work |
| **R6C commit** | **`9ae57d0a983640ed84b2aa845d1ae0560ef50dfd`** (`9ae57d0`) — `feat(design-system): migrate people to proven patterns`, 8 files: the two People detail routes, the raffle detail route, `UserRowActions`, `TeamMemberActions`, `TeamCommissionCard`, `CatalogSettingsCard` and this handoff. **No Core file** |
| **R7A** | audit only, no production change. §10.40. Committed together with the prerequisite below |
| **R7-PRE commit** | **`e718bf8e4ecccf8248638249ff1eea4cd512a17e`** (`e718bf8`) — `fix(design-system): reconcile search input touch sizing`, 5 files: the shared search field, its three call sites and this handoff. **No Core API change** |
| **R7B commit** | **`afb94bf64e9a8c293168166d363266310224d202`** (`afb94bf`) — `feat(design-system): migrate public catalog to catalog theme semantics`, 7 files: the six catalogue files and this handoff. **No Core file, no new token** |
| **R8A** | audit only, no production change. §10.44. Committed together with the Pattern below |
| **Dashboard Pattern commit** | `docs(design-system): define dashboard page pattern` — this handoff only: closure mode (§10.45), the responsive collection guideline (§10.46) and the Dashboard Page contract (§10.47). Hash recorded in the R8 pass below |
| Untracked (pre-existing, **not** created by any Design System phase) | `CorrecionesLoterias.txt`, `prueba-abono.csv` — untouched throughout |
| Pushed | **no** — and no push is authorized |
| `main` | **not moved**, still at `124445b` |

Every wave is an independently revertible checkpoint — `git revert 3aae867` removes the whole token
layer and nothing else, and the same holds for each later commit. R6D is deliberately separate from
R6C for the same reason: reverting the shared menu's touch floor must not take the People route work
with it, and reverting People must not put the menu back to 32 px on phones.

**Do not alter the two pre-existing untracked files.** They belong to the user.

`docs/design-system/` is intended project documentation and must be kept. If Wave 1 is moved to a
dedicated migration branch, **carry this directory into that working tree** — the handoff is the only
continuity mechanism between sessions.

> A future session **MUST re-run `git status` and verify HEAD**, because the repository may change
> after this handoff. This checkpoint is historical context, **not** permission to assume the
> repository is unchanged.

---

## 12. Files to read first

Minimum useful set before Wave 1. All paths verified 2026-09-06.

| Path | Why |
|---|---|
| `src/app/globals.css` | **The whole token layer.** `:root` (light), `.dark` (line 33), `@theme inline` (line 59), `.catalog-theme` (line 374). Tailwind v4 — there is no separate Tailwind theme config file. |
| `src/components/ui/` | 21 shadcn primitives (`button.tsx`, `badge.tsx`, `input.tsx`, `select.tsx`, …) — the Wave 3 targets. |
| `src/components/data/StatusBadge.tsx` | The 10 hardcoded palette classes; the highest-value single reconciliation item. |
| `src/features/dashboard/tones.ts` | The three class families per data role. Read the header comment — it states *why* `pending` is grey and not red. |
| `src/components/data/PaymentProgressBar.tsx` | **Does not import `tones.ts`** — it duplicates the data palette inline and paints `partial` **amber** where `tones.ts` paints it blue. Renders in all four ticket lists. Read it before touching `data/*` (§7B). |
| `src/components/data/` | `DataTable.tsx`, `MetricCard.tsx`, `TrendChart.tsx`, `DonutChart.tsx`, `CollectionSummaryCard.tsx`. |
| `src/components/layout/AppShell.tsx`, `src/components/layout/AppSidebar.tsx` | Sidebar widths and the overlay behaviour (a comment states it is deliberately not a dialog). |
| `src/lib/constants.ts` | Every status, role and label string. **Single source** for the Spanish status labels. |
| `docs/UX_COPY_GUIDELINES.md` | Binding for any user-visible text. Imported into `CLAUDE.md` §35. |
| `src/features/clients/components/`, `src/app/(protected)/seller/clients/` | The approved pilot surface — read only when its phase is authorized. |
| `CLAUDE.md` | Application-side rules: phases, documentation duties, §35 copy rules, §36 Claude Code ↔ Codex protocol. |

---

## 13. Do-not-do list

A new session must **NOT**:

- restart the Design System from scratch, or rebuild Figma foundations;
- reinterpret Apple HIG or Atlassian as the new authority;
- change approved Figma decisions casually — report a contradiction, do not act on it alone;
- execute later migration waves automatically;
- perform a big-bang migration;
- remove legacy variables before their consumers are migrated;
- activate the new admin brand appearance before **Wave 3** is explicitly authorized — the fenced pin
  block in `globals.css` is the only thing holding it back, and deleting it *is* the brand flip;
- assume Wave 2 is authorized because Wave 1 succeeded;
- modify unrelated code, or refactor outside the authorized scope;
- touch the pre-existing untracked user files;
- implement the Clientes pilot before its phase is approved;
- generate Code Connect files (`.figma.ts`);
- assume a Figma limitation must exist in code;
- push to a remote, or commit, without the user asking.

---

## 14. New session startup procedure

1. Read this handoff file completely.
2. Inspect current `git status` and HEAD; compare against §11.
3. Connect to Figma (`use_figma`, with the `figma-use` skill loaded).
4. Read `00 — Start Here`.
5. Read `04 — Design to Code`.
6. Verify the Wave 1 / token-contract sections against the current code — especially `globals.css`.
7. **Report any contradiction or stale assumption BEFORE editing anything.**
8. If everything matches, execute **only** the explicitly authorized phase.
9. Stop after that phase.
10. Report results, update this file (§16), and wait for approval.

---

## 15. NEW CLAUDE CODE SESSION — START HERE

```
Read docs/design-system/RIFAS_DESIGN_SYSTEM_HANDOFF.md in full before doing anything else.

Then:
1. Run git status and git rev-parse HEAD, and compare them with the repository checkpoint in
   that file.
2. Open the Figma file (key 7KIwO0iiGpksLSNjMeSa4X) with use_figma, loading the figma-use skill
   first, and read the pages "00 — Start Here" and "04 — Design to Code".
3. Confirm out loud: which phase is complete, and which phase is authorized next.

Rules:
- Do not rely on any previous chat history; the handoff file and Figma are the only sources.
- Do not ask me to repeat information that is already documented there.
- If the Figma file, the handoff file and the repository contradict one another, STOP and report
  the contradiction instead of guessing or "fixing" it.
- Execute only the phase I explicitly authorize, then stop and report.
```

---

## 16. Continuity rule

> **Every future migration phase must update THIS SAME file before the session ends.**

Do **not** create `HANDOFF-v2.md`, `HANDOFF-final.md`, `HANDOFF-new.md` or any other variant. There is
exactly **one** living handoff for the Design System track, at
`docs/design-system/RIFAS_DESIGN_SYSTEM_HANDOFF.md`.

At the end of each approved phase, update:

- **Last completed phase** (header)
- **Current status** (header)
- **Repository checkpoint** (§11 — branch, HEAD, working tree)
- **Debt / reconciliation changes** (§7 — items closed, items discovered)
- **Next authorized phase** (header and §10)
- **Inventory** (§4) if the Figma file changed
- **Current position** in the wave table (§9)

This is what prevents continuity from depending on chat history.
