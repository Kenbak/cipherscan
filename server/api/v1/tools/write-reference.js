const fs = require('node:fs');
const path = require('node:path');
const { MANIFEST } = require('../inventory/manifest');
const queryParameters = require('../inventory/query-parameters.json');
function buildReference() {
  return MANIFEST.filter(entry => entry.classification === 'public').map(entry => ({
    method: entry.method, path: entry.v1.path, description: entry.description,
    category: entry.domain, query: queryParameters[`${entry.method} ${entry.v1.path}`] || [],
    listKey: entry.v1.listKey || null, zatoshiFields: entry.v1.zatoshiFields || [],
    note: entry.v1.notes || null, ownershipToken: Boolean(entry.v1.forwardNodeToken),
  }));
}
if (require.main === module) {
  const dir = path.resolve(__dirname, '../../../../lib/generated'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'api-reference.json'), JSON.stringify(buildReference(), null, 2) + '\n');
}
module.exports = { buildReference };
