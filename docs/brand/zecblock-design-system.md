# ZecBlock — Assay / Revision 03

Design direction and implementation specification · 5 September 2026

Status: local rebrand branch; not deployed. Mainnet identity: ZecBlock, zecblock.com. Supplied logo assets are authoritative. Screenshot values are historical examples, never live data or evidence of network status.

Current logo update: the owner supplied `zecblockdot.png` and replaced the leading-square lockup with this exact ZecBlock logotype and trailing gold dot. Header width is 112px across breakpoints; footer and chart signatures are 96px. The network line remains below the logotype. Light mode uses the original silhouette as a CSS mask, with #DB9E00 gold and dark lettering; the downloadable original remains unchanged. This supersedes earlier leading-square lockup notes.

## 01 / Read the existing product

The homepage works because it answers a practical sequence: locate an identifier, inspect current chain activity, inspect what is waiting. Keep the navigation categories, configurable two-column feeds, network strip, announcements and mempool. Keep privacy visible alongside ordinary transaction activity. These are product decisions, not decoration.

The strongest identity is in its monospace numbers, full identifiers on detail pages, `>` prompts, terse technical labels, thin rules and dark canvas. The ZecBlock square should extend this vocabulary: a block, a position, a selected item. The supplied wordmark provides enough personality; never redraw it using the UI font.

What feels less mature: low-contrast explanatory copy; three competing chrome strips; excessively rounded, nested cards; a centered promotional hero that delays the tool; shouting labels with equally loud weights; pseudo-random redacted amounts; saturated unrelated series; ambient cyan washes; glowing focus; oversized chart watermarks. The supply screenshot spends hundreds of pixels repeating quantities already listed below. The verification donut offers apparent precision while exaggerating its smaller slice in code.

Preserve: prompt-led search, keyboard shortcut, hashes and amounts in mono, customizable feeds, technical density, privacy labels, all existing route and data semantics. Remove: cyan, ambient color gradients, glowing controls, chart watermarks over data, ornamental rounding and lifted cards. Refine: contrast, left alignment, section rhythm, exact proportion encoding, legends and typed numeric columns.

Cyan currently does five jobs: logo, link, input, announcement and data series. Split those responsibilities. Logo and primary action use gold; ordinary links use ink with a gold interaction state; announcements use a quiet marker; privacy uses iris; network series use steel or gold according to their role. A terminal prompt should mark an entry point or section, not every sentence and button.

## Revision 02 / Critical review

The first implementation was too safe. It retained the familiar dashboard formula: oversized brand, oversized sans-serif title, a wide empty hero flank, repeated card outlines, decorative pseudo-terminal eyebrow and an all-over tinted palette. Olive backgrounds, olive rules and olive-grey text collapsed the hierarchy into mud. Gold spread across this warm base lost its sharp identity. Those are failures of proportion and contrast, not a shortage of visual features.

Revision two removes the olive cast entirely from dark structural surfaces. Carbon #0B0C0E, neutral grey rules and clear type put the gold square back in charge. The original standalone wordmark is 110px wide; a single 30px square spans the wordmark and 9px network label. This preserves the supplied artwork and restores the former compact two-line masthead.

The hero is a workspace: a 28–30px regular mono heading on the left, the actual search on the right, aligned to the feed columns. It collapses to one column on smaller screens. The unnecessary network eyebrow is removed. Open ruled tables replace homepage card boxes, with lowercase mono section keys, quieter headers and aligned outer columns. These few details are the recognizable system. No decorative chart fills the former empty area.

This revision borrows the best restraint of Field Manual and the best typography of System Console without importing either direction wholesale. The percentages in the creative brief are qualitative targets, not measurable design scores.

## Revision 03 / Restore breathing room

The owner found the two-column hero cramped and the semantic colors faded. The center split forced two different reading tasks to compete, while the small network label made the square seem oversized. Revision three returns the title, balanced introduction and search to one centered 800px column, with 28px between introduction and search. The search remains left-aligned internally; the feeds retain their wider two-column grid. Heading is 40px medium sans, 28px mobile; mono remains the language of commands and data. This deliberately restores a successful part of the original information architecture.

Navbar lockup: original 118px wordmark, readable 11px network line, 5px vertical separation, a 32px square with 11px gap. Gold is now the original #F8BC21, success #65C79A, privacy #B6A0E0, warning #E2A66E. Neutral backgrounds remain unchanged; text is brighter (#F1F3F5 / #C2C7CF / #9CA4B0). Restraint comes from limiting the area occupied by color, not reducing the legibility of meaningful values. These current values supersede earlier revision descriptions.

## 02 / Three art directions

### 1. Assay — recommended

Concept: a carefully calibrated instrument for inspecting the public chain. Personality: precise, independent, calm, durable. Gold + graphite + iris; sage and clay are reserved for semantic movement.

Typography: retain locally hosted Geist Sans for names, explanations and headings; Geist Mono for controls, hashes, numeric values, timestamps and chart labels. 14–16px prose; 12–14px data; 28–38px page titles. Sentence-case titles, lowercase mono section keys. Spacing: 4px base, 24px panel padding, 32px column gaps, 48–64px section gaps. Borders: single 1px neutral rules. Radius: 0 on the mark and data bars, 3px badges, 4px controls, 8px containers, 12px dialogs. Icons: existing outline family, consistent 1.5–2px strokes, no filled icon tiles.

Data: direct labels, aligned exact values, compact proportion bars, neutral history and gold current observations; iris identifies shielded activity. Search remains a command field with `>` and a keyboard hint. Dark: neutral carbon with three subtly distinct surfaces. Light: warm white with ink, brass interactions and pale neutral rules, not inverted dark mode.

Principle references: [Apple interface typography and hierarchy](https://developer.apple.com/design/human-interface-guidelines/typography); [Linux Kernel Archives](https://www.kernel.org/) for trustworthy utility and explicit versions; [Observable Plot](https://observablehq.com/plot/) for economical statistical marks. These are principles, not layouts to copy.

### 2. Field Manual

Concept: the explorer as an open cryptographic reference book. Personality: studious, editorial, humane, archival. Palette: paper #F5F1E8, ink #242420, antique gold #AD791A, lichen #777D65; dark counterpart #111316 with paper-colored type. Typography: Geist Sans headings and prose, mono values and margin notes. More narrative, less uppercase. Spacing: 8px rhythm, 40px gutters, 64px section breaks. Layout: open sections with 1px horizontal rules; few cards. Radius: 0–2px, 6px dialogs. Icons: small schematic line drawings and explicit labels.

Data: plots resemble annotated research figures; tables pair values with tiny rank bars; source, denominator and timestamp occupy a consistent margin. Terminal language survives in command search and identifiers only. Light mode is the lead expression; dark mode preserves the same page-like hierarchy without sepia effects.

Principle references: [Our World in Data](https://ourworldindata.org/) for contextual explanations and source visibility; [GNU manuals](https://www.gnu.org/manual/manual.html) for durable navigation and technical language. Avoid copying their branding or publication layouts.

Ranking: second. Strongest for learning, privacy research and exportable analysis. Weaker as the everyday identity for live chain monitoring; risks making fast tools feel like reports.

### 3. System Console

Concept: a contemporary Unix workstation for the network. Personality: expert, austere, fast, slightly underground. Palette: carbon #111312, chalk #E8EBE6, gold #F6BC29, olive #9BA67E; errors muted vermilion. Light: #F0F2ED with #20261F and darker brass. Typography: Geist Mono throughout, 12–14px body, 28px titles, bold used rarely. Spacing: 4px base, 12–16px panel padding, 20px gutters. Thin perimeter rules form contiguous work areas. Radius: 0–2px throughout. Icons: sparse line glyphs paired with words; visible shortcuts.

Data: compact small multiples, fixed-width numeric columns, step lines for discrete chain states, text legends and narrow crosshairs. Terminal labels are more prominent: `network_status`, `recent_blocks`, `pending`. No fake shell sessions, scrolling code backgrounds, CRT effects or animated cursors. Both themes use the same dense layout.

Principle references: [Wireshark User’s Guide](https://www.wireshark.org/docs/wsug_html_chunked/) for synchronized inspection panes and [htop](https://htop.dev/) for glanceable technical status. Deliberately reject their rainbow palette.

Ranking: third. Most distinctive in a screenshot, but gives up too much everyday readability. It intensifies the existing terminal aesthetic when this rebrand should mature it.

## 03 / Assay system

Typography follow-up: the current size/weight roles, 12px floor and contrast-tested light colors are specified in [zecblock-typography.md](zecblock-typography.md). That implementation supersedes smaller caption/network sizes in earlier revision notes.

### Color and roles

Dark / light pairs:

- Canvas: #0B0C0E / #F8F7F3. Surface: #111316 / #FFFFFF. Elevated: #191B1F / #F0EFE9. Hover: #1B1E23 / #EDECE5.
- Primary type: #F1F3F5 / #20221D. Secondary: #C2C7CF / #4F5448. Muted: #9CA4B0 / #666D5D. Do not add opacity to essential labels.
- Border: #2C3037 / #D7DBCF. Subtle rule: #20242A / #E7E9E1.
- Logo gold: #F8BC21 in both themes (supplied identity). Interactive/data gold: #F8BC21 / #866008. Filled buttons use logo gold with graphite text in both themes.
- Aggregate shielded: gold #F8BC21 / #DB9E00, with text/outline ink #F8BC21 / #876000. Orchard: iris #B6A0E0 / #7040B5.
- Sapling: sage #91AC90 / #587652. Sprout: stone #7F897A / #64705F. Ironwood: honey gold #E8CF78 / #BA8A1A, with text/outline ink #E8CF78 / #805D10. Transparent: steel #A1A9AD / #667278.
- Success / inward shielding: sage #65C79A / #506F43. Deshielding / warning: clay #E2A66E / #92603D. Error / negative: rose-clay #D58D86 / #A74640.
- Current/primary: gold. Secondary: steel. Comparison: iris only for privacy, otherwise sage/stone. Historical: muted steel, with dashed stroke when shown against current. Selected: existing series color at full opacity plus a neutral crosshair or outline. Never recolor a series to gold merely because it is hovered.

Color is redundant encoding: labels, position, signed values, outlines and patterns must carry the meaning too. Gold is not an all-purpose positive or warning color. A shield is a transaction property, not proof of safety.

### Typography and number formatting

Use the existing local Geist files; no remote font dependency. Sans for explanations, mono for data and commands. Tabular, lining numerals; disable discretionary ligatures in hashes. Shared page heading 38px desktop / 30px mobile; homepage medium sans 40px desktop / 28px mobile, tight tracking. Section key 12–14px mono, lowercase, restrained weight and tracking. Body 14–16px / 1.6; data 13–14px / 1.5. Chart labels at least 11px when feasible. Reserve 10–11px for secondary metadata, never primary values.

Right-align comparable numbers and their units consistently. Retain existing zatoshi conversions and exact-amount access. Compact notation belongs in summaries, never raw identifiers. ZEC precision follows actual source precision; do not add false precision. USD values retain currency markers. Rates always include a denominator (ZEC/hr, GSol/s). Distinguish zero, unknown, unavailable, pending and shielded. Redacted values use animated nonnumeric blocks with an accessible hidden-amount label; they never simulate an amount. Timestamp tooltips should expose absolute time and timezone. A relative age is not the data observation time.

### Layout and navigation

1280px outer container, 24–32px desktop gutters, 16px mobile. Twelve-column conceptual grid; paired feeds use six each, collapse to one below lg. Narrative copy is capped near 65 characters. Keep Explore / Analytics / Tools / Resources; retain the network picker and local preferences. Desktop chrome stays compact; mobile uses the existing menu. Network brackets remain explicit. Brand mark stays square and logo aspect ratio remains intact. Navbar uses a 32px square beside the 118px wordmark and the network label underneath the wordmark.

Homepage order: navigation, stats, announcement, centered explorer heading and command search, configurable feeds, mempool. Remove the promotional Zcash emblem from the heading because the masthead now owns the brand. No decorative hero chart or redundant row of statistics. Preserve saved feed selection keys.

### Components

- Buttons: 36px compact / 44px primary touch targets, 4px radius. Gold fill only for primary actions; secondary neutral border; ghost text actions. 120–150ms color response, no hover translation.
- Inputs/search: neutral surface and single rule; gold outline on focus. Persistent accessible name, `>` entry marker, working Enter and Cmd/Ctrl+K. Examples remain functional. No ambient focus glow.
- Cards: homepage feed tables have open horizontal rules and square edges. Elsewhere use flat surfaces, 1px neutral boundary, 8px corners, 16px compact or 24px standard padding. Use open sections when a boundary adds no information. Do not nest a card around every metric.
- Tables: retain 20px left/right edge insets on homepage feeds, including column headers. Open rules do not mean zero padding. 44px archive / 48–52px preview rows; mono values; understated mono headers, row hover in neutral surface, visible keyboard focus. Stable widths, no layout jump on refresh. Overflow scrolls rather than silently clipping.
- Badges: text first, 3px radius, subtle tint, no glow. Lifecycle words accompany icons. Gold denotes selection; sage success; clay warning; rose error; iris shielded. Pending is a state, not failure.
- Transaction indicators: existing transparent/partial/shielded symbols and flow arrows remain. Show public amounts only when available; shielded values use a readable label and explanation. Do not equate shielded with anonymous.
- Blocks: square marker and exact height; a neutral progression rule may connect ordered observations. Bar height encodes actual size on a linear baseline; finality colors require actual finality data. Orphan and pending labels remain distinct.
- Icons: retain shared outline icons; use 16/20px with uniform strokes. No emoji, decorative icon backgrounds or 3D symbols in ordinary controls.
- Hover: neutral row background; gold link/focus cue; chart crosshair without glow. All pointer information should have a keyboard or text equivalent.
- Loading: dimensionally stable neutral skeletons, restrained opacity animation respecting reduced motion. Never show a zero as a placeholder. Keep last known data and source age where supported.
- Empty: concise statement of the actual condition and a useful action, not an oversized illustration. Empty private address activity must not imply the address has no funds.
- Error: specific unavailable/missing distinction, retry where useful, inline error color and words. Preserve actual 404 behavior. No full-page alarming red treatment for temporary data failure.

### Information design

A plot earns its space by answering a question. Tables are the primary format for exact lookup; sparklines add shape only when a meaningful history exists. Never fabricate a history from a current value.

Lines: 1.5–2px, linear interpolation for observed samples unless a documented discrete state calls for steps. No smoothing that invents trends. Areas: flat low-opacity fill; stacked amounts share a zero baseline and denominator. Bars: square ends and true zero, no minimum visible size that changes proportion. Histograms preserve bin widths and explicit counts/units. Percentages must name their denominator. Comparisons use consistent scales; log axes must be labeled and ticked mathematically. Missing samples are gaps, not zeros.

Axes: 3–5 readable ticks depending on width; normally horizontal grid only, faint but visible. Tooltips: surface, 1px border, 8px radius, 12px mono numbers, absolute timestamp, unit and series name. Prefer direct values and endpoint labels over a detached legend when series count permits. Time selectors use a shared segmented control. Series toggles retain color identity. Zoom only where dataset density warrants it.

Signature opportunities: exact supply strip against the 21M cap; compact block progression; public input/output flow diagrams with clearly marked shielded boundaries; explicit migration direction with separate volume and cumulative balance. Never draw hidden shielded input/output relationships as known edges. The audit in `zecblock-visualization-audit.md` records decisions per component.

## 04 / Delivery and migration

This branch applies the visual foundations throughout the frontend, the supplied identity to shared chrome, mainnet metadata to zecblock.com, and a restrained homepage evolution. Chart-format changes focus on supply verification, supply map, network hashrate, and block activity. Other chart re-evaluations are documented recommendations; shared palette and shell changes do not constitute a completed chart rewrite.

Keep API, RPC, WebSocket, social handles, GitHub repositories, donation destinations and saved preference keys intact. These are operational identities, not interchangeable brand strings. Testnet/Crosslink retain existing hosts until migration is confirmed. Mainnet canonical identity changes are staged code: domain ownership, DNS, TLS, CDN redirects and external service CORS must be checked at rollout. A permanent old-mainnet-host redirect belongs in the migration; no redirect between different network datasets.

## Verification and release limits

Local implementation, not deployed. Typecheck, lint with the existing warning budget, frontend regressions and production build are required. Brand regressions cover exact verification proportions, 0/100 boundaries, unavailable values, and network metadata policies. Browser checks cover desktop layout, mobile width, themes and command search.

Raw HTML checks cover homepage, pools, Ironwood, press and tools metadata, one H1, canonical, robots, social tags and JSON-LD, plus sitemap and generated image endpoints. Existing invalid transaction/block pages can stream HTTP 200 with noindex/not-found content; this pre-existing lifecycle limitation is not fixed by the visual rebrand and must be resolved before claiming full SEO lifecycle compliance. Testnet and Crosslink hosts remain unchanged. Production DNS/TLS and host redirect activation have not been deployed.

### Shared table containers, shielded amounts and light gold — 2026-09-05

Recent blocks, shielded activity, and mempool now use the same surface, border, radius and category-badge system as the rest of the app. The homepage-only open-table overrides have been removed, while 20px edge insets, shared section headings and row rhythm remain. Mempool retains its pending summary and explicit transaction-type labels. At the user’s request, shielded amounts display four monospace redaction blocks (█▓▒), changing one texture every 480ms. The fixed footprint never displays digits or an estimated amount. Accessible labels remain stable; reduced-motion preference stops the animation, including preference changes while the page is open. Light-mode brand fills and the logotype use the requested **#DB9E00**. Superseded by the subsequent owner request: gold text and fine data strokes now also use **#DB9E00**. The original downloadable PNG remains unchanged; its silhouette is masked with theme colors for light-mode display. These are local frontend changes, not a deployed release.

### Light palette clarification — 2026-09-05

The owner explicitly requested #DB9E00 on gold text, including Buy ZEC, not only fills. Gold/yellow CSS and RGB channels, chart and flow palettes, Ironwood scene and pool marks now match that exact color. Light neutrals are #F6F7F9 canvas, #FFFFFF surface, #171A20 primary, #444B55 secondary and #59616D muted; the previous olive cast is removed. Semantic hues are #14734B green, #7040B5 violet and #A34A16 orange. Sapling category badges use green to match the pool chart; Ironwood retains gold. Supply segments no longer fade their light-mode colored fills, and overlay labels use full-opacity contrasting ink. Gold text is an explicit exception to the normal-text contrast target; the test matrix now checks 85 body/semantic combinations, excluding light gold, plus primary-action text. This remains local, not deployed.

### Hero alignment — 2026-09-05

Owner-approved refinement keeps the centered 800px hero column, with the heading, description, command search and examples aligned to its left edge. Mainnet introduction: “Inspect the Zcash network. Blocks, transactions and shielded pools.” A small static gold square follows the unchanged H1; it is decorative and hidden from assistive technology. Hero bottom padding is 28px on desktop (previously 52px) and 16px on mobile (previously 24px), bringing feeds closer. Network-specific testnet/Crosslink copy, metadata and data architecture are preserved. Local implementation only.

Latest alignment correction (2026-09-05): the owner identified a staircase between logo, centered stats and inset hero. The hero now spans the existing max-w-7xl content container, with its left edge shared by the logo and feed tables. Search spans that full content width. Stats remain left-aligned at every breakpoint; their previous xl centering is removed. This supersedes the inset 800px hero above. Typography, marker and concise copy remain.

Masthead correction (2026-09-05): navigation categories now align immediately after the logo, with a 24px extra gap on lg screens; utilities remain right-aligned. This removes the centered navigation cluster that conflicted with the left-anchored stats and hero. Homepage search is capped at 800px while retaining the shared left edge. The previous full-width search decision is superseded.

**Current owner preference — 2026-09-05:** restore the centered composition. Navigation categories and the desktop stats group are centered again. Hero uses a centered 800px column with centered heading and description; search contents and examples retain their natural left alignment within that column. The gold heading marker, concise copy, compact logo, current palette, typography and shared table containers are retained. This supersedes the preceding left-anchored layout experiments.


### Privacy identity follow-up — 2026-09-07

Gold is the shared shielded identity. Ironwood keeps a softer honey-gold pool identity permanently; Orchard remains purple, Sapling green, Sprout slate and transparent steel. Aggregate shielded and its child pools must be shown at separate levels or in separate views, never as additive competing series. Labels, shield/arrow shapes, patterns and pool names carry meaning alongside color; the subtle difference between the two golds is not a category key by itself. Small light-mode privacy labels/outlines use darker role-specific ink; chart fills and brand/action gold retain their documented colors. Generic gold/purple tokens must not be reassigned globally. Use `lib/privacy-palette.ts`, chart/flow adapters and CSS `cipher-shielded`/`cipher-ironwood` roles. Badge, transaction-category, pool registry, canvas and Three.js consumers share these identities. Miner reward outcomes use neutral held balances so held and shielded do not become two gold series.
