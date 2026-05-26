# LexyOS Design System Memo

**Seven — 2026-05-25**

## 1. Color Palette — Lexy "Skittles"

The LexyOS palette is warm, vibrant, and deliberately distinct from Mike's cool `rgb(0,136,255)` azure monoculture. Every named token below is already wired in `public/styles.css` as `var(--skittle-*)` and should remain the canonical source.

| Token | Hex | Role | Usage |
|-------|-----|------|-------|
| `--skittle-red` | `#ff4d6d` | **Danger / reject** | Reject gate, error panel, blocked tasks |
| `--skittle-yellow` | `#ffe66d` | **Warning / attention** | Pending badges, alert highlights, review needed |
| `--skittle-green` | `#2dd4bf` | **Success / approve** | Approve gate, healthy metrics, passing status |
| `--skittle-blue` | `#60a5fa` | **Primary / info** | Selected card rings, focus outlines, live endpoints |
| `--skittle-purple` | `#c084fc` | **Accent / brand** | Brand orb glow, filing/service packets, accent buttons |
| `--skittle-amber`| `#fbbf24` | **Secondary warning** | Stale matters, overdue gates (warm contrast against yellow) |

### Contrast rules
- `--skittle-purple` on `--bg` (#070910) ≥ WCAG AA (contrast ~5.8:1).
- `--skittle-green` on dark ≥ ~6.2:1.
- `--skittle-yellow` text is used only as a **background tint** (`rgba(251, 191, 36, .12)`) with `#fef3c7` foreground, never as primary text on dark.
- `--skittle-red` text is `#fecdd3` on `rgba(255, 77, 109, .12)`.

### Background / surfaces
| Token | Value |
|-------|-------|
| `--bg` | `#070910` |
| `--bg-radial` | Radial gradient with cyan/purple glow at top corners + deep navy sweep |
| `--panel` | `rgba(15,22,34,.78)` |
| `--panel-2` | `rgba(23,32,48,.84)` |
| `--surface-raised` | `rgba(255,255,255,.06)` |

## 2. Layout Principles — Mike-like, Lexy language

### Grid order (desktop → mobile)
From the existing `public/styles.css` `.seven-shell`:

```css
.seven-shell {
  display: grid;
  grid-template-columns: 280px 330px minmax(520px, 1fr) 360px;
  gap: 14px;
  height: 100vh;
  padding: 14px;
  overflow: hidden;
}
```

| Column | Width | Role | Mike equivalent |
|--------|-------|------|-----------------|
| 1 | 280px | **Matter nav + search + audit trail** | Sidebar: list of matters / chat |
| 2 | 330px | **Files list + baseline data + stage timeline** | Sidebar: project details / file browser |
| 3 | `minmax(520px, 1fr)` | **Document workspace + cockpit controls** | Main content: document viewer, chat |
| 4 | 360px | **Agent rail + gates + tasks + Eva** | Right rail: assistant, status |

This is the **Mike-like left-nav / matter-centric layout** translated into Lexy: matters instead of chat-first, legal panels instead of generic file tabs.

### Responsive breakpoints
| Width | Behavior | Rule |
|-------|----------|------|
| `> 1390px` | Full 4-column desktop | Default |
| `<= 1390px` | Right rail drops to bottom row | `.agent-rail { grid-column: 1 / -1; }` |
| `<= 1024px` | Left nav + files collapse to sidebar | 3-column: nav / content / bottom rail |
| `<= 640px` | Single column stack | All panels stack vertically |

### Hierarchical nesting
- Brand orb + title occupy the top of column 1.
- Search is immediately below (proximity = wayfinding).
- Matter list fills remaining space with scroll.
- Audit trail is bottom of column 1 (low-priority info follows matters).
- Cockpit controls are at the top of workspace (matter actions).
- Document frame is the workspace's flex child (it should fill available vertical space, not a fixed `calc(100vh - 275px)`).
- Agent rail is the eastern command surface (Scandinavian / LangChain cockpit pattern).

## 3. Typography

### Stack
| Context | Font |
|---------|------|
| UI / data labels | Inter, ui-sans-serif, system-ui |
| Documents / filings | EB Garamond, Georgia, serif |
| Monospace / API / audits | JetBrains Mono, SF Mono, monospace (fallback) |

### Scale
| Role | Size | Weight | Letter-spacing | Color |
|------|------|--------|----------------|-------|
| Document title (H1) | `clamp(32px, 4vw, 54px)` | 900 | `-0.055em` | `#f5f8ff` |
| Panel kickers (H2/H3) | 11px | 500 | `0.14em` uppercase | `--muted` |
| Brand title | 25px | 900 | `-0.05em` | `#f5f8ff` |
| Matter card title | 14px | 700 | normal | `#f5f8ff` |
| Matter card meta | 12px | 400 | normal | `--muted` |
| Baseline label | 11px | 400 | `0.08em` uppercase | `--muted` |
| Baseline value | 14px | 700 | normal | `#f5f8ff` |
| Metric value | 22px | 700 | normal | `#f5f8ff` |
| Metric label | 11px | 500 | `0.12em` uppercase | `--muted` |
| Document body | 18px | 400 | normal | `#101827` |
| Gate chip label | 14px | 700 | normal | `#f5f8ff` |

## 4. Component Library

### Button states

| Variant | Background | Text | Border | Use |
|---------|-----------|------|--------|-----|
| **Default / primary** | `linear-gradient(135deg, rgba(96,165,250,.95), rgba(45,212,191,.86))` | `#031018` | `rgba(255,255,255,.10)` | Generate artifact, create proposal |
| **Success / approve** | `linear-gradient(135deg, var(--skittle-green), var(--skittle-yellow))` | `#031018` | same | Approve gate |
| **Danger / reject** | `linear-gradient(135deg, rgba(255,77,109,.24), rgba(59,13,19,.92))` | `#fecdd3` | same | Reject gate, error emphasis |
| **Accent / filing** | `linear-gradient(135deg, var(--skittle-purple), var(--skittle-blue))` | `#f8fbff` | same | Prepare filing / service packets |
| **Muted** | `rgba(255,255,255,.08)` | `--muted` | `var(--line)` | Corpus search, secondary actions |

All buttons share `border-radius: 16px; padding: 12px; font-weight: 850; box-shadow: 0 12px 28px ...;` and `transition: transform .12s ease` on hover.

### Form elements
- **Inputs**: `background: rgba(7,11,19,.76); border: 1px solid var(--line-strong); border-radius: 16px; padding: 12px 14px;`
- **Focus**: `border-color: var(--skittle-blue); box-shadow: 0 0 0 3px rgba(96,165,250,.16);`
- **Textarea**: min-height 118px, resize vertical.
- **Select-matter search**: full width, top of nav, no borders on focus that clash with brand orb.

### Panel chrome
- `.shell-card` is the atomic container unit.
- `border: 1px solid var(--line)` — `rgba(165,196,255,.16)`.
- `border-radius: 28px`.
- `backdrop-filter: blur(22px) saturate(140%)`.
- Backgrounds vary by column: nav uses `--panel`; files uses a deeper gradient; workspace uses a near-black gradient.

### Status badges

| Status | Border | Background | Color |
|--------|--------|------------|-------|
| pending | `rgba(251,191,36,.35)` | `rgba(251,191,36,.12)` | `#fef3c7` |
| approved | `rgba(45,212,191,.35)` | `rgba(45,212,191,.12)` | `#d1fae5` |
| rejected | `rgba(255,77,109,.35)` | `rgba(255,77,109,.12)` | `#fecdd3` |
| blocked | same as pending | same as pending | `#fef3c7` |

Badge is an `inline-flex` pill with `border-radius: 999px`, `padding: 5px 10px`, `font-weight: 700`, used inside matter cards, gates, and task cards.

### Gate / approval chips
- Full-width row: `border-radius: 18px`, `padding: 12px 14px`.
- Background: very subtle gradient `rgba(96,165,250,.10) → rgba(192,132,252,.10)`.
- Two-column label + meta left, badge right.
- Selected chip adds same blue ring treatment as `.matter-card.selected`.

### Document artifact cards
- `.artifact-card` uses `border-radius: 18px`, `border: 1px solid var(--line)`, `--panel-2` background.
- Header is flex row with title + type label (type is uppercase 11px, muted).
- Use inside agent-rail task list, not document workspace.

### Status timeline dots
- 10px circles with glow shadows.
- `done` = --skittle-green with green glow.
- `active` = --skittle-blue with blue glow.
- `future` = `--line-strong` (dimmed).
- Vertical steps separated by 12px row gap.

## 5. App-level layout — component map

```
LexyOS Shell (4-column desktop)
├── aside.lexy-nav.shell-card        … LEFT NAV
│   ├── brand-stack (orb + LexyOS/Seven)
│   ├── search input
│   ├── matter-list .matter-card
│   └── nav-audit .audit-trail
├── aside.files-panel.shell-card     … FILES + BASELINE
│   ├── panel-kicker "Matter baseline"
│   ├── file-list .file-card
│   ├── baseline-panel .baseline-row
│   └── status-timeline .status-step
├── section.document-workspace       … WORKSPACE
│   ├── workspace-header (title + pill)
│   ├── metric-strip .metric-card
│   ├── cockpit-controls .btn
│   └── document-frame .doc-preview
└── aside.agent-rail.shell-card      … AGENT RAIL
    ├── session / API pre
    ├── active-endpoints .api-receipt
    ├── gate-list .gate-chip
    ├── tasks .artifact-card
    └── Eva textarea + btn
```

This map is the Rog build contract. The HTML preview artifact renders every selector above exactly once, using the production CSS token names.

## 6. Dark / light mode

The LexyOS system is **dark-first** (`color-scheme: dark`). Light mode is not required for MVP; if added later, the only surfaces that flip to light are `document-frame` (the only light-colored region by design, because legal documents render in warm off-white for readability).

If light mode is ever required, maintain `--bg`, `--panel`, `--text` via `@media (prefers-color-scheme: light)` tokens; do not flip badge, button, or Skittles colors. The Skittles are palette-agnostic.

## 7. Accessibility notes
- Every `aside` and `section` carries an `aria-label` matching its purpose.
- All interactive elements are `<button>` (no clickable divs without role).
- Focus ring is visible: `box-shadow: 0 0 0 3px rgba(96,165,250,.16)` on inputs.
- Color is **not** the only status indicator: badges use border + background tint + icon text; timeline uses dots + text labels.
- Minimum touch target: 44px on mobile (cockpit controls and matter cards already exceed this).

## 8. Decisions frozen for this sprint
- **Do not add a fifth Skittle.** Five is the max for human scan. If another semantic role appears, replace one of the existing roles (e.g., amber can absorb warning + attention).
- **Do not change the border radius ladder.** 14px / 18px / 28px is the current hierarchy; keep it.
- **Do not add shadows to text.** Only glows on brand orb and metric cards.
- **Do not introduce a separate dark/light button palette.** Buttons already have high contrast via gradient and black text.

---

*Rendered in:* `design-lane/lexyos-design-preview.html`
*Updated implementation-notes.md with design section referencing this memo.*
