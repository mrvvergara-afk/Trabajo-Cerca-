---
name: Territorial Craft
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#44474c'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#74777d'
  outline-variant: '#c4c6cc'
  surface-tint: '#525f71'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#0f1c2c'
  on-primary-container: '#778598'
  inverse-primary: '#bac8dc'
  secondary: '#006a68'
  on-secondary: '#ffffff'
  secondary-container: '#94efec'
  on-secondary-container: '#006e6d'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#390c00'
  on-tertiary-container: '#d3623a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e4f9'
  primary-fixed-dim: '#bac8dc'
  on-primary-fixed: '#0f1c2c'
  on-primary-fixed-variant: '#3a4859'
  secondary-fixed: '#97f2ef'
  secondary-fixed-dim: '#7ad6d3'
  on-secondary-fixed: '#00201f'
  on-secondary-fixed-variant: '#00504e'
  tertiary-fixed: '#ffdbcf'
  tertiary-fixed-dim: '#ffb59c'
  on-tertiary-fixed: '#390c00'
  on-tertiary-fixed-variant: '#822801'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.005em
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes a high-craft territorial employment platform anchored in southern Chile (Biobío, Malleco, Araucanía). It deliberately departs from bureaucratic civic portals and sterile job boards. The visual paradigm merges modern neobank precision with an understated regional soul: deliberate, modern, and human.

The interface evokes immediate institutional trust while remaining agile and warm. It treats regional labor markets, local skills, and spatial proximity with the analytical refinement of contemporary fintech products. The experience balances deep oceanic calm with earth-rooted tactile accents, framing regional connection as an aspirational, dignified pursuit.

Key stylistic pillars:
- **Refined Minimalism:** Ample negative space, intentional micro-alignments, strictly constrained surface tiers, and ruthless elimination of non-essential decorative borders.
- **Fintech Precision:** Razor-thin hairline dividing structures, highly legible tabular typographic pairings, micro-badges, and concise card heights.
- **Territorial Beacon Metaphor:** Subtle, glowing pulse indicators and spatial radius badges that signal local opportunity without visual noise.

## Colors

The palette draws inspiration from the natural geography of southern Chile—the cold Pacific currents, deep native spruce forests, and volcanic clay soils—translated into modern neobank digital tokens.

### Color Roles & Distribution
- **Primary (`#0D1B2A` — Deep Oceanic Navy):** Anchors high-priority structural surfaces, primary action buttons, headline typography, and high-emphasis focal items.
- **Secondary (`#007A78` — Spruce Teal):** Communicates active proximity, verified listings, local radar signals, and positive systemic validations. Represents connection, geography, and forward momentum.
- **Tertiary (`#C85A32` — Warm Terracotta):** Used selectively for urgency accents, highlighted compensation tags, primary conversion triggers, and localized highlight badges. Never used as large backdrop fills.
- **Neutral (`#64748B` — Slate Steel):** Governs structural borders, supporting metadata, label tracks, and low-contrast surface foundations (`#F8FAFC` base background; `#FFFFFF` cards).

### Semantic Logic
- **Radar Beacon Pulse:** Secondary Spruce Teal with a 15% opacity radial glow ring used strictly on proximity indicators and active matching nodes.
- **State Borders:** Base container borders utilize `#E2E8F0` (light slate border), transitioning to `#0D1B2A` on keyboard focus and active selection.

## Typography

Typography establishes an analytical, high-confidence tone. The pairing relies on **Plus Jakarta Sans** for prominent headers to deliver human, rounded clarity, and **Inter** for dense data displays, body content, and UI utility controls.

### Implementation Guidelines
- **Numeric & Metric Data:** All compensation data, commuting distances, and municipal metrics use `font-feature-settings: "tnum" on, "cv05" on` to ensure tabular alignment in data cards.
- **Labels and Badges:** `label-sm` is consistently rendered uppercase with a slight positive tracking (`+0.04em`) when identifying territorial communes (e.g., "ANGOL • MALLECO", "TEMUCO", "CONCEPCIÓN").
- **Contrast Ratios:** Pure `#000000` is strictly avoided; headers use `#0D1B2A`, secondary body text uses `#475569`, and deactivated labels use `#94A3B8`.

## Layout & Spacing

The layout model is built on an adaptive 12-column grid system designed to support horizontal balance, compact list cards, and contextual geo-filtering sidebars.

### Breakpoints & Grid Composition
- **Desktop (≥ 1280px):** 12 columns, max-width `1280px`, `gutter: 1.5rem`, `margin: 2.5rem`. Search controls and territorial filter engines lock into a persistent 4-column sticky sidebar; job feeds and interactive maps occupy the remaining 8 columns.
- **Tablet (768px – 1279px):** 8 columns, `gutter: 1.25rem`, `margin: 2rem`. Territorial filters collapse into a horizontal scrolling drawer or sheet.
- **Mobile (< 768px):** 4 columns, `gutter: 1rem`, `margin: 1rem`. Fluid vertical stack prioritizing proximity tags, compensation pills, and fast application CTAs.

### Spacing Rules
- Keep interactive card heights strictly contained. Prefer horizontal density (using metadata rows separated by delicate middots `•`) over vertical bloat.
- Internal component paddings rely on `space-md` (`1rem`) for list entries and `space-lg` (`1.5rem`) for primary standalone modals and highlight panels.

## Elevation & Depth

Visual hierarchy leverages crisp surface distinction and low-contrast outlines rather than heavy drop shadows. The design conveys lightness, modern digital craftsmanship, and dimensional restraint.

### Depth Mechanics
- **Base Canvas:** Neutral cool tint (`#F8FAFC`).
- **Surface Elevation 1 (Card & Containers):** Solid pure white (`#FFFFFF`) with a `1px` continuous border in `#E2E8F0`. No ambient shadow in resting state.
- **Surface Elevation 2 (Hover & Active States):** Solid white with a razor-thin border (`#CBD5E1`) paired with a diffused ambient shadow: `0 8px 24px -4px rgba(13, 27, 42, 0.06), 0 2px 6px -2px rgba(13, 27, 42, 0.03)`.
- **Floating Overlays & Menus:** Crisp `#FFFFFF` surface accompanied by `0 16px 36px -8px rgba(13, 27, 42, 0.10)`.

### Radar Beacon Accent
Selected territorial indicators (e.g., "A 12 min de tu ubicación") employ a non-elevated, glowing pulse accent created through dual-ring layering: an inner dot (`#007A78`) framed by an ultra-soft translucent diffusion aura (`rgba(0, 122, 120, 0.18)`), creating life without skeumorphic weight.

## Shapes

The design uses a restrained, tailored corner language (`roundedness: 1`). Corners remain structured and precise, evoking institutional maturity rather than playful or toy-like interfaces.

### Corner Radii Hierarchy
- **Base Elements (`rounded-sm`, 0.25rem / 4px):** Form controls, tabular cells, inline utility tags, and code/metric wrappers.
- **Interactive Cards & Panels (`rounded-lg`, 0.5rem / 8px):** Job listing cards, territorial search inputs, candidate preview modules, and filter containers.
- **Modals & Drawers (`rounded-xl`, 0.75rem / 12px):** Top-level dialog sheets, profile cards, and application flow overlays.
- **Pills (`rounded-full`, 9999px):** Status badges, proximity indicators, and circular action beacons only. Buttons retain an intentional `8px` radius for a crisp, structural silhouette.

## Components

### Buttons
- **Primary:** Background `#0D1B2A`, text `#FFFFFF`, border none, radius `8px`, height `44px`, padding horizontal `1.25rem`. Hover state shifts background to `#1B2E4B` with subtle scale transition.
- **Secondary / Ghost:** Transparent background, `1px` border `#E2E8F0`, text `#0D1B2A`, radius `8px`. Hover introduces a wash of `#F1F5F9`.
- **Territorial Proximity CTA:** Spruce Teal `#007A78` background with crisp white text, used strictly for hyper-local matches or direct contact actions.

### Cards (Job Listing & Local Hub)
- Contained height to maximize listing density on desktop viewports.
- Pure `#FFFFFF` background with `1px solid #E2E8F0`.
- Interior structure: Top row holds the job title (`headline-sm`) and salary pill; second row displays the company, territorial commune name (`label-sm` in uppercase), and proximity distance dot; bottom row holds verified contract badges and publication date.
- Hover brings border transition to `#CBD5E1` and ambient elevation 2.

### Chips & Proximity Badges
- **Locality Chip:** Soft background `rgba(0, 122, 120, 0.08)`, text `#007A78`, border `1px solid rgba(0, 122, 120, 0.2)`. Features a miniature pulsing green/teal dot at the leading edge.
- **Terracotta Highlight Chip:** Soft background `rgba(200, 90, 50, 0.08)`, text `#C85A32`, border `1px solid rgba(200, 90, 50, 0.25)`. Reserved for urgent shifts, stipends, or transportation-included signals.

### Inputs & Commute Radius Selectors
- Height `44px`, base border `1px solid #E2E8F0`, fill `#FFFFFF`, text `#0D1B2A`, placeholder `#94A3B8`.
- Focus state reveals a `1.5px solid #0D1B2A` boundary accompanied by a zero-distance outer ring `box-shadow: 0 0 0 3px rgba(13, 27, 42, 0.08)`.
- **Radius Slider / Segmented Control:** Segmented pill toggle (`5km`, `15km`, `30km`, `Región`) using soft grey track `#F1F5F9` and pure white thumb with subtle outline.

### Checkboxes & Radio Controls
- Small `16px` squared inputs (`4px` radius for checkboxes, full circle for radios).
- Inactive border `#CBD5E1`; selected state background `#0D1B2A` with pure white check glyph.