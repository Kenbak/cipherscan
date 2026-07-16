import { median, percentile, readSlowPageExport, routeGroup } from './slow-page-utils.mjs';

const filename = process.argv[2];
if (!filename) {
  console.error('Usage: npm run perf:analyze -- /path/to/slow-page-export.csv');
  process.exit(2);
}

const rows = readSlowPageExport(filename);
const ttfb = rows.map((row) => Number(row['Time to first byte (ms)']));
const loadDelta = rows.map((row) => (
  Number(row['Loading time (ms)']) - Number(row['Time to first byte (ms)'])
));
const groups = new Map();

for (const row of rows) {
  const route = routeGroup(row.URL);
  if (!groups.has(route)) groups.set(route, []);
  groups.get(route).push(Number(row['Time to first byte (ms)']));
}

console.log(`rows=${rows.length} median_ttfb_ms=${median(ttfb)} p95_ttfb_ms=${percentile(ttfb, 0.95)} median_load_after_ttfb_ms=${median(loadDelta)}`);
for (const [route, values] of [...groups].sort((left, right) => right[1].length - left[1].length)) {
  console.log(`${route.padEnd(24)} n=${String(values.length).padStart(3)} median_ms=${String(median(values)).padStart(7)} p95_ms=${String(percentile(values, 0.95)).padStart(5)} max_ms=${String(Math.max(...values)).padStart(5)}`);
}
