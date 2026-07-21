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

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = file.slice(ROOT.length);
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');

    lines.forEach((line, i) => {
      for (const m of line.matchAll(ARBITRARY_HEX)) {
        violations.push(`${rel}:${i + 1} arbitrary hex color "${m[0]}" — use a token utility`);
      }
      for (const m of line.matchAll(INLINE_VAR_COLOR)) {
        violations.push(`${rel}:${i + 1} static inline var() color — use the utility class instead`);
      }
      for (const m of line.matchAll(ARBITRARY_VAR)) {
        violations.push(`${rel}:${i + 1} arbitrary var() utility "${m[0]}" — use the token utility spelling (e.g. bg-cipher-hover)`);
      }
    });
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

if (violations.length > 0) {
  console.error('Design-token violations:\n');
  for (const v of violations) console.error(`  ${v}`);
  console.error(`\n${violations.length} violation(s). See scripts/check-design-tokens.mjs header for the rules.`);
  process.exit(1);
}

console.log('Design tokens OK — no arbitrary hex colors, no .light style overrides, no static inline var() colors.');
