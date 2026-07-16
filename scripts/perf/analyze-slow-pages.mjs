import { median, percentile, readSlowPageExport, routeGroup } from './slow-page-utils.mjs';

const filename = process.argv[2];
if (!filename) {
  console.error('Usage: npm run perf:analyze -- /path/to/slow-page-export.csv');
  process.exit(2);
}

const rows = readSlowPageExport(filename);
const ttfb = rows.map((row) => Number(row['Time to first byte (ms)']));
const load = rows.map((row) => Number(row['Loading time (ms)']));
const loadDelta = load.map((value, index) => value - ttfb[index]);
const groups = new Map();

for (const row of rows) {
  const route = routeGroup(row.URL);
  if (!groups.has(route)) groups.set(route, []);
  groups.get(route).push({
    load: Number(row['Loading time (ms)']),
    ttfb: Number(row['Time to first byte (ms)']),
  });
}

console.log(
  `rows=${rows.length}`
  + ` median_load_ms=${median(load)}`
  + ` p95_load_ms=${percentile(load, 0.95)}`
  + ` median_ttfb_ms=${median(ttfb)}`
  + ` p95_ttfb_ms=${percentile(ttfb, 0.95)}`
  + ` median_load_after_ttfb_ms=${median(loadDelta)}`,
);
for (const [route, values] of [...groups].sort((left, right) => right[1].length - left[1].length)) {
  const routeLoads = values.map((value) => value.load);
  const routeTtfb = values.map((value) => value.ttfb);
  console.log(
    `${route.padEnd(24)}`
    + ` n=${String(values.length).padStart(3)}`
    + ` median_load_ms=${String(median(routeLoads)).padStart(7)}`
    + ` p95_load_ms=${String(percentile(routeLoads, 0.95)).padStart(5)}`
    + ` median_ttfb_ms=${String(median(routeTtfb)).padStart(7)}`
    + ` p95_ttfb_ms=${String(percentile(routeTtfb, 0.95)).padStart(5)}`,
  );
}
