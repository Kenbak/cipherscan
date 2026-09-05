#!/usr/bin/env node
/**
 * Design-token guard — keeps the styling system coherent.
 *
 * Fails the build/CI when code reintroduces patterns that the design
 * coherence overhaul eliminated:
 *
 *   1. Arbitrary hex colors in markup (text-[#...], bg-[#...], ...).
 *      Use a token utility (text-cipher-*, text-danger, bg-glass-*) —
 *      add a token in globals.css @theme if none fits.
 *
 *   2. `.light .selector { ... }` style-override blocks in globals.css.
 *      Theme by flipping CSS variables in the `.light` root block, never
 *      by overriding component/utility rules. (Blocks that only set
 *      custom properties, e.g. `.light .crosslink-graph { --x: ... }`,
 *      are the sanctioned pattern and are allowed.)
 *
 *   3. Static CSS-variable color inline styles in TSX:
 *      style={{ color: 'var(--color-...)' }} — use the matching utility
 *      class instead (text-primary, text-muted, bg-cipher-surface, ...).
 *
 *   4. Retired pre-ZecBlock palette literals. The rebrand replaced the
 *      neon CipherScan palette, but a layer of second-tier component
 *      tokens kept the old values, so badge fills sat in a different hue
 *      family than their own text. Derive tints from the brand channel
 *      vars — rgb(var(--color-purple-rgb) / 0.14) — never a raw literal.
 *
 *   5. Terminal section keys. `> ALL_BLOCKS` / `> recent_blocks` is one
 *      device with one spelling: SCREAMING_SNAKE_CASE in source (the
 *      primitives apply the casing). "PRIVACY SCORE" and "Network" broke
 *      the convention and read as three different systems on one site.
 *
 * Run: node scripts/check-design-tokens.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SCAN_DIRS = ['app', 'components'];

const violations = [];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      yield* walk(p);
    } else if (/\.(tsx|ts|jsx|css)$/.test(entry)) {
      yield p;
    }
  }
}

const ARBITRARY_HEX = /\b(?:text|bg|border|from|to|via|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/g;
const INLINE_VAR_COLOR = /style=\{\{[^}]*(?:color|background(?:Color)?):\s*['"]var\(--color-[^}]*\}\}/g;
// bg-[var(--color-hover)] etc. — the token utility (bg-cipher-hover) is the
// one sanctioned spelling. This also catches references to variables that
// don't exist (which silently render nothing).
const ARBITRARY_VAR = /\b(?:text|bg|border|divide|from|to|via|ring|fill|stroke)-\[var\(--[a-z0-9-]+\)\]/g;

// Retired CipherScan palette. Keys are matched literally (whitespace-loose
// for rgb/rgba triples); values name the replacement.
const RETIRED_COLORS = [
  ['0,230,118', 'sage — rgb(var(--color-green-rgb) / a)'],
  ['167,139,250', 'iris — rgb(var(--color-purple-rgb) / a)'],
  ['124,58,237', 'iris — rgb(var(--color-purple-rgb) / a)'],
  ['255,107,53', 'clay — rgb(var(--color-orange-rgb) / a)'],
  ['239,68,68', 'danger — rgb(var(--danger-rgb) / a)'],
  ['248,113,113', 'danger — rgb(var(--danger-rgb) / a)'],
  ['251,191,36', 'gold — rgb(var(--color-gold-rgb) / a)'],
  ['245,158,11', 'gold — rgb(var(--color-gold-rgb) / a)'],
  ['8,9,15', 'canvas is #0B0C0E — rgba(11, 12, 14, a)'],
  ['#EF4444', 'var(--danger)'],
  ['#F59E0B', 'var(--color-gold)'],
  ['#FBBF24', 'var(--color-gold)'],
  ['#D97706', 'var(--color-gold)'],
  ['#00D4FF', 'gold replaced cyan — var(--color-gold)'],
];

// Terminal section keys: SCREAMING_SNAKE_CASE only.
const SECTION_KEY = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/;
const EYEBROW_LITERAL = /\beyebrow=(?:"([^"]*)"|\{'([^']*)'\}|\{"([^"]*)"\})/g;
const SECTION_LABEL_LITERAL = /\bsectionLabel:\s*'([^']*)'/g;
const SECTION_HEADER_TAG = /<SectionHeader\b[\s\S]{0,240}?\/?>/g;
const NESTED_LABEL = /\blabel=(?:"([^"]*)"|\{'([^']*)'\})/;

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = file.slice(ROOT.length);
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');

    lines.forEach((line, i) => {
      for (const m of line.matchAll(/\btext-\[(?:[0-9]|1[01])px\]/g)) {
        violations.push(`${rel}:${i + 1} sub-12px text "${m[0]}" — use text-caption or a larger role`);
      }
      for (const m of line.matchAll(/\btext-(?:muted|secondary|primary)\/\d+/g)) {
        violations.push(`${rel}:${i + 1} faded information text "${m[0]}" — use the contrast-tested text token without opacity`);
      }
      for (const m of line.matchAll(/\bfontSize(?::\s*|=\{)(?:[0-9]|1[01])\b/g)) {
        violations.push(`${rel}:${i + 1} sub-12px chart text "${m[0]}" — keep chart labels readable`);
      }
      for (const m of line.matchAll(ARBITRARY_HEX)) {
        violations.push(`${rel}:${i + 1} arbitrary hex color "${m[0]}" — use a token utility`);
      }
      for (const m of line.matchAll(INLINE_VAR_COLOR)) {
        violations.push(`${rel}:${i + 1} static inline var() color — use the utility class instead`);
      }
      for (const m of line.matchAll(ARBITRARY_VAR)) {
        violations.push(`${rel}:${i + 1} arbitrary var() utility "${m[0]}" — use the token utility spelling (e.g. bg-cipher-hover)`);
      }
      // Compare with spaces stripped so "rgba(0, 230, 118, .1)" matches.
      const dense = line.replace(/\s+/g, '');
      for (const [literal, replacement] of RETIRED_COLORS) {
        if (dense.includes(literal)) {
          violations.push(`${rel}:${i + 1} retired palette color "${literal}" — use ${replacement}`);
        }
      }
    });

    // Section keys must be SCREAMING_SNAKE_CASE in source.
    const keys = [
      ...[...src.matchAll(EYEBROW_LITERAL)].map((m) => ['eyebrow', m[1] ?? m[2] ?? m[3]]),
      ...[...src.matchAll(SECTION_LABEL_LITERAL)].map((m) => ['sectionLabel', m[1]]),
      ...[...src.matchAll(SECTION_HEADER_TAG)]
        .map((m) => NESTED_LABEL.exec(m[0]))
        .filter(Boolean)
        .map((m) => ['SectionHeader label', m[1] ?? m[2]]),
    ];
    for (const [prop, value] of keys) {
      if (value && !SECTION_KEY.test(value)) {
        violations.push(`${rel} section key ${prop}="${value}" — use SCREAMING_SNAKE_CASE (e.g. ${value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')})`);
      }
    }
  }
}

// globals.css: .light .selector blocks may only flip CSS variables
const globals = readFileSync(join(ROOT, 'app/globals.css'), 'utf8');
const lightBlocks = globals.matchAll(/^\s*\.light\s+[^{]+\{([^}]*)\}/gm);
for (const block of lightBlocks) {
  const body = block[1];
  const declarations = body
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean);
  const styleDecls = declarations.filter((d) => !d.startsWith('--') && !d.startsWith('/*'));
  if (styleDecls.length > 0) {
    const line = globals.slice(0, block.index).split('\n').length;
    violations.push(
      `app/globals.css:${line} .light override sets style declarations (${styleDecls[0]}...) — flip a CSS variable instead`,
    );
  }
}

// Undefined variable references — var(--x) used anywhere (TSX or CSS) must
// resolve to a variable defined in the stylesheets. Catches silent no-ops
// like the never-defined --color-bg-card / --color-text-tertiary bugs.
{
  const cssSources = SCAN_DIRS.flatMap((dir) =>
    [...walk(join(ROOT, dir))]
      .filter((file) => file.endsWith('.css'))
      .map((file) => readFileSync(file, 'utf8')),
  ).join('\n');
  const defined = new Set([...cssSources.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]));
  // Defined outside the stylesheets: next/font injects the geist vars,
  // Tailwind owns --tw-*, React Flow owns --xy-*.
  const external = /^--(font-geist|tw-|xy-)/;

  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const rel = file.slice(ROOT.length);
      const src = readFileSync(file, 'utf8');
      src.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/var\((--[a-z0-9-]+)/g)) {
          const name = m[1];
          if (!defined.has(name) && !external.test(name)) {
            violations.push(`${rel}:${i + 1} var(${name}) is never defined — the declaration silently does nothing`);
          }
        }
      });
    }
  }
}

if (violations.length > 0) {
  console.error('Design-token violations:\n');
  for (const v of violations) console.error(`  ${v}`);
  console.error(`\n${violations.length} violation(s). See scripts/check-design-tokens.mjs header for the rules.`);
  process.exit(1);
}

console.log('Design tokens OK — colors, theme rules, text-size floor and information-text opacity are consistent.');
