"use client";
import { useState } from "react";
import {
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { ChartCard } from "@/components/network/ChartCard";
import { useTheme } from "@/contexts/ThemeContext";
import { getChartColors } from "@/lib/chart-theme";
import { Analytics, Unit, value } from "./model";
const BUCKETS = [
  "<$10",
  "$10–50",
  "$50–100",
  "$100–500",
  "$500–1K",
  "$1K–5K",
  "$5K–10K",
  "$10K–50K",
  "$50K+",
];
export function ActivityCharts({
  data,
  unit,
}: {
  data: Analytics;
  unit: Unit;
}) {
  const { theme } = useTheme(),
    colors = getChartColors(theme);
  const [view, setView] = useState<"volume" | "count">("volume");
  const points = data.trends.map((p) => ({
    ...p,
    label:
      data.granularity === "hour"
        ? p.bucket.slice(5, 16).replace("T", " ")
        : p.bucket.slice(0, 10),
    Inflow: p[`inflow_${unit}`] == null ? null : Number(p[`inflow_${unit}`]),
    Outflow:
      p[`outflow_${unit}`] == null ? null : -Number(p[`outflow_${unit}`]),
    Net:
      p[`inflow_${unit}`] == null || p[`outflow_${unit}`] == null
        ? null
        : Number(p[`inflow_${unit}`]) - Number(p[`outflow_${unit}`]),
  }));
  const distribution = BUCKETS.map((label, bucket) => ({
    label,
    swaps: data.distribution.find((b) => b.bucket === bucket)?.swaps || 0,
  }));
  const tooltipStyle = {
    backgroundColor: colors.tooltipBg,
    borderColor: colors.tooltipBorder,
    color: colors.tooltipText,
  };
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <ChartCard
        title="Volume & activity"
        className="xl:col-span-2"
        height={300}
        controls={
          <div className="filter-group">
            <button
              className={`filter-btn ${view === "volume" ? "filter-btn-active" : ""}`}
              aria-pressed={view === "volume"}
              onClick={() => setView("volume")}
            >
              Volume
            </button>
            <button
              className={`filter-btn ${view === "count" ? "filter-btn-active" : ""}`}
              aria-pressed={view === "count"}
              onClick={() => setView("count")}
            >
              Swaps
            </button>
          </div>
        }
      >
        <p className="text-xs text-muted mb-4">
          {data.granularity === "hour" ? "Hourly" : "Daily"} UTC buckets ·
          boundary buckets are partial · gaps are unknown.
        </p>
        <ResponsiveContainer width="100%" height={260} minWidth={0}>
          <ComposedChart data={points} margin={{ left: 0, right: 8 }}>
            <CartesianGrid
              stroke={colors.grid}
              strokeDasharray="2 6"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              minTickGap={45}
              tick={{ fill: colors.axis, fontSize: 12 }}
            />
            <YAxis
              width={65}
              tick={{ fill: colors.axis, fontSize: 12 }}
              tickFormatter={(v) =>
                view === "count"
                  ? Number(v).toLocaleString()
                  : value(v, unit).replace(" ZEC", "")
              }
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(l) => `${l} UTC`}
              formatter={(v) =>
                view === "count"
                  ? Number(v).toLocaleString()
                  : value(v == null ? null : Number(v), unit)
              }
            />
            <ReferenceLine y={0} stroke={colors.axis} />
            <Legend />
            {view === "count" ? (
              <Bar
                dataKey="swaps"
                name="Observed swaps"
                fill="var(--color-cipher-gold)"
              />
            ) : (
              <>
                <Bar dataKey="Inflow" fill="var(--color-cipher-green)" />
                <Bar dataKey="Outflow" fill="var(--color-cipher-orange)" />
                <Line
                  dataKey="Net"
                  stroke={colors.axis}
                  dot={false}
                  connectNulls={false}
                />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Swap sizes" height={300}>
        <p className="text-xs text-muted mb-4">
          One successful swap per USD bucket. Both directions; missing USD
          values excluded.
        </p>
        <ResponsiveContainer width="100%" height={260} minWidth={0}>
          <BarChart
            data={distribution}
            layout="vertical"
            margin={{ left: 5, right: 12 }}
          >
            <XAxis type="number" tick={{ fill: colors.axis, fontSize: 12 }} />
            <YAxis
              type="category"
              dataKey="label"
              width={78}
              tick={{ fill: colors.axis, fontSize: 12 }}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar
              dataKey="swaps"
              name="Swaps"
              fill="var(--color-cipher-gold)"
              radius={[0, 3, 3, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
