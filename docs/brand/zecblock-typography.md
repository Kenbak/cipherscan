# ZecBlock typography and contrast

Implemented on the local rebrand branch, 5 September 2026. Not deployed.

## Audit and decisions

The pre-normalization source inventory found 811 occurrences of 7–11px Tailwind text utilities, 356 `font-bold` occurrences and more than 120 information-text opacity modifiers. These are source occurrences, not unique rendered elements. Dense labels were often smaller and fainter simultaneously. Chart axes used inconsistent 9–12px values; page titles ranged from 20px to 60px and differed in weight without a clear semantic reason.

The correction uses explicit roles while preserving the existing two font families and product information architecture. Labels, controls, data, headings and editorial content have different purposes; coherence means consistent roles, not making every item the same size.

## Current scale

| Role | Size at default 16px root | Weight | Family / leading |
|---|---:|---:|---|
| Supporting labels, chart ticks, badges | 12px minimum | 400; 500 for column/field labels | Mono for technical labels; 1.5 |
| Compact data | 13px | 400 | Geist Mono; 1.5, tabular numerals |
| Controls and detail rows | 14px | 400 or 500 when selected | Mono for commands, sans for explanations; 1.5 |
| Page introductions / prose | 15–16px | 400 | Geist Sans; 1.6–1.65 |
| Panel headings | 14–16px | 500 or 600 for card titles | Mono technical keys; sans descriptive titles |
| Editorial section headings | 20–24px | 500–600 | Geist Sans; 1.3–1.4 |
| Summary metric | 28px; 24px mobile | 500 | Geist Mono; 1.2 |
| Page title | 32px; 28px mobile | 500 | Sans; mono retained for block/identifier contexts; 1.2 |
| Homepage title | 40px; 28px mobile | 500 | Geist Sans; 1.2 |

Use `.type-page`, `.type-section`, `.type-label`, `.type-metric`, `.type-metric-compact`, `.type-data`, `.type-prose` and `text-caption`, `text-data`, `text-body`. Tokens use rem units; SVG chart font sizes remain 12px in the scalable chart coordinate system. Existing `text-xs`, `text-sm`, `text-base` remain compatible 12/14/16px values. Long-form newsletter prose retains its larger editorial scale, with supporting text raised to 12px.

Regular 400 carries information. Medium 500 establishes hierarchy and selection. Semibold 600 is reserved for short emphasis and descriptive card headings. Routine UI no longer uses 700/900 weights. Supplied logo artwork remains unchanged; its network line is 12px. Hashes retain full identifiers, wrapping/copy behavior, and monospaced typesetting. Comparable numbers use lining, tabular numerals.

## Contrast and visibility

Normal information text targets at least 4.5:1, including on hovered and selected standard surfaces. The automated check evaluates 85 combinations: nine dark foreground roles and eight light foreground roles × five surface roles, plus dark text on a gold primary action. It does not round a failing value up to the threshold.

Dark roles remain clear neutral type on carbon. Light muted text is #59616D, privacy #7040B5 and warning/deshielding #A34A16; these adjustments correct failures on selected/hovered surfaces. RGB opacity utility channels match the semantic hex values. Chart axes and tooltips use the same family and corresponding theme palette. Ordinary grey text utilities now use theme-aware semantic tokens.

Do not add opacity to `text-primary`, `text-secondary` or `text-muted`. Decorative marks and genuinely disabled controls may retain opacity. Color is not the only indicator of transaction state: words, icons, signed deltas and position remain.

Mobile text-entry fields use 16px to avoid automatic iOS focus zoom. Page titles wrap and use responsive rem sizes. Data tables may scroll horizontally; the page itself should reflow. Both homepage feeds retain 20px edge insets. Larger hashrate tick labels have a 100px axis gutter and a 32px minimum date-tick gap; the protocol chart's compact value gutter was enlarged to 56px.

## Enforcement and verification

- `npm run lint:design` rejects sub-12px Tailwind text utilities, sub-12px numeric chart text and faded information-text utilities.
- `npm run test:brand` includes `server/tests/typography-contrast.test.js`, which checks the actual CSS tokens, plus existing chart-integrity and network-metadata regressions.
- `npm run verify:fast` checks lint and TypeScript; `npm run test:frontend` includes the typography contrast tests.
- Browser inspection covers representative dense pages, including pools and mining in dark/light mode, computed 32px/500 page headings, 12px chart ticks and desktop overflow. The final mobile reflow browser check timed out; mobile zoom behavior is not fully verified. This is not a claim that every route, chart overlay or custom 3D surface has received a full WCAG audit. Recheck long labels, zoom and real data at each breakpoint when adding new components.

References: [WCAG 2.2 contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [text resizing](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).

Owner-selected exception (2026-09-05): light brand text now uses exact #DB9E00, matching logo and fills. This does not meet the 4.5:1 normal-text target on white and is explicitly excluded from the light text contrast matrix. This is a deliberate brand preference, not an accessibility pass. Body text, semantic states, axes and neutral values remain contrast-tested.
