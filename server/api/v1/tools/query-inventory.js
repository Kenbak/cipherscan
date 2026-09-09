// Build the query-name inventory from authoritative handlers. Validation of
// domain-specific values remains in those handlers; the v1 boundary rejects
// unknown names and repeated/structured values before dispatch.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../../../node_modules/typescript');
const { MANIFEST } = require('../inventory/manifest');
const root = path.resolve(__dirname, '../../../..');

function buildQueryInventory() {
  const result = {};
  for (const entry of MANIFEST.filter(e => e.v1.status === 'adapter')) {
    const file = path.join(root, entry.file);
    const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let handler;
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
          && node.expression.name.text === entry.method.toLowerCase()) {
        const route = node.arguments[0];
        const paths = route && ts.isArrayLiteralExpression(route) ? route.elements : [route];
        const expected = entry.domain === 'signals' ? entry.legacyPath.replace('/api/signals', '') : entry.legacyPath;
        if (paths.some(value => value && ts.isStringLiteral(value) && value.text === expected)) handler = node.arguments.at(-1);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    if (!handler) throw new Error(`Missing authoritative handler: ${entry.method} ${entry.legacyPath}`);
    const keys = new Set();
    function scan(node) {
      if (ts.isPropertyAccessExpression(node) && node.expression.getText(ast) === 'req.query') keys.add(node.name.text);
      if (ts.isVariableDeclaration(node) && node.initializer?.getText(ast) === 'req.query' && ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) keys.add(element.propertyName?.getText(ast) || element.name.getText(ast));
      }
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 'parseSafeListPagination') {
        keys.add('limit'); keys.add('offset');
      }
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 'parseSafePagePagination') {
        keys.add('limit'); keys.add('page');
      }
      ts.forEachChild(node, scan);
    }
    scan(handler);
    if (entry.v1.shape === 'list') for (const key of ['direction', 'cursor_idx', 'cursor_id', 'cursor_txid']) keys.delete(key);
    result[`${entry.method} ${entry.v1.path}`] = [...keys].sort();
  }
  result['GET /v1/names'] = ['cursor', 'limit'];
  for (const suffix of ['/status', '/:name', '/:name/events']) result[`GET /v1/names${suffix}`] = [];
  return result;
}

if (require.main === module) fs.writeFileSync(path.join(__dirname, '../inventory/query-parameters.json'), JSON.stringify(buildQueryInventory(), null, 2) + '\n');
module.exports = { buildQueryInventory };
