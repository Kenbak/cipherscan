const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const vm = require("node:vm");
const fs = require("node:fs");
const target = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync("components/crosschain/timeline.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  target,
);
const { dailyTrends, alignReference } = target.exports;
const plain = (x) => JSON.parse(JSON.stringify(x));
const row = (bucket, amount) => ({
  bucket,
  swaps: amount,
  inflow_usd: amount == null ? null : String(amount),
  outflow_usd: "0",
  inflow_zec: amount == null ? null : String(amount),
  outflow_zec: "0",
});
test("daily comparison sums UTC hours once, preserving unknown hours and real zeroes", () => {
  const result = plain(
    dailyTrends([
      row("2026-09-01T00:00:00Z", 2),
      row("2026-09-01T01:00:00Z", 3),
      row("2026-09-02T00:00:00Z", 2),
      row("2026-09-02T01:00:00Z", null),
      row("2026-09-03T00:00:00Z", 0),
    ]),
  );
  assert.equal(result.length, 3);
  assert.equal(result[0].bucket, "2026-09-01T00:00:00.000Z");
  assert.equal(result[0].inflow_zec, "5");
  assert.equal(result[1].inflow_zec, null);
  assert.equal(result[1].swaps, null);
  assert.equal(result[2].inflow_zec, "0");
});
test("reference joins keep the activity date domain and never forward-fill missing price or shielding", () => {
  const dates = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"];
  const rows = [
    { date: "2026-08-31", net: 100 },
    { date: "2026-09-01T00:00:00.000Z", net: -10 },
    { date: "2026-09-03", net: 0 },
    { date: "2026-09-04", net: null },
  ];
  assert.deepEqual(plain(alignReference(dates, rows, "net")), [
    { label: dates[0], reference: -10 },
    { label: dates[1], reference: null },
    { label: dates[2], reference: 0 },
    { label: dates[3], reference: null },
  ]);
  assert.ok(
    alignReference(dates, rows, "priceUsd").every((r) => r.reference === null),
  );
});
