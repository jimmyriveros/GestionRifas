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

> **CURRENT POSITION: Waves 1, 2, 3A, 3B1, 3B1b, 3B2, 4, 4.5A, 4.5B and 5 are approved and
> committed. Wave 6 is executed, uncommitted, awaiting review.**
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
> **NEXT: WAVE 7 — PATTERNS & PILOT SCREEN (Clientes, Seller portal). NOT AUTHORIZED.** Its refreshed
> preflight is §10.23: all three blockers are closed and the pilot reads READY.

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

## 11. Repository checkpoint — 2026-09-06

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
| **Wave 6.6 commit** | `feat(design-system): reconcile pilot accessibility controls` — 10 files. Hash recorded in the Wave 7 pass below |
| Untracked (pre-existing, **not** created by any Design System phase) | `CorrecionesLoterias.txt`, `prueba-abono.csv` — untouched throughout |
| Pushed | **no** — and no push is authorized |
| `main` | **not moved**, still at `124445b` |

Every wave is an independently revertible checkpoint — `git revert 3aae867` removes the whole token
layer and nothing else, and the same holds for each later commit. **Wave 6 is deliberately left
uncommitted** so its visual diff — the sky correction to `data/partial` and the grey correction to
`data/pending` — can be reviewed or discarded without disturbing anything already committed.

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
