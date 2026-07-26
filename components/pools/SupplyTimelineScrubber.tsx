'use client';

import { useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import {
  ZCASH_LAUNCH_DATE,
  ZCASH_SUPPLY_MILESTONES,
  milestonePositionPct,
} from '@/lib/zcash-milestones';

const CALENDAR_STEPS = 1000;
/** Minimum horizontal gap (percent of track) before showing a milestone label. */
const MIN_MILESTONE_LABEL_GAP = 7;
/** Hide positioned labels in the right reserve (Live button zone). */
const MILESTONE_LABEL_MAX_PCT = 90;

export interface SupplyTimelineScrubberProps {
  historyDates: string[];
  scrubIndex: number;
  mode: 'live' | 'scrub';
  scrubDateLabel: string | null;
  coverageStart?: string | null;
  onScrub: (index: number) => void;
  onLive: () => void;
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function calendarPctForDate(dateStr: string, rangeEnd: string): number {
  return milestonePositionPct(dateStr.slice(0, 10), ZCASH_LAUNCH_DATE, rangeEnd);
}

function nearestIndexAtOrBefore(dates: string[], targetDate: string): number {
  let idx = 0;
  for (let i = 0; i < dates.length; i++) {
    if (dates[i].slice(0, 10) <= targetDate) idx = i;
    else break;
  }
  return idx;
}

function dateFromCalendarPct(pct: number, rangeEnd: string): string {
  const launchMs = new Date(`${ZCASH_LAUNCH_DATE}T00:00:00Z`).getTime();
  const endMs = new Date(`${rangeEnd}T00:00:00Z`).getTime();
  const span = Math.max(endMs - launchMs, 1);
  const atMs = launchMs + (pct / 100) * span;
  return new Date(atMs).toISOString().slice(0, 10);
}

function milestoneLabelVisibility(milestones: { id: string; pct: number }[]): Map<string, boolean> {
  const sorted = [...milestones].sort((a, b) => a.pct - b.pct);
  const visible = new Map<string, boolean>();
  let lastLabelPct = -Infinity;

  for (const milestone of sorted) {
    if (milestone.pct > MILESTONE_LABEL_MAX_PCT) {
      visible.set(milestone.id, false);
      continue;
    }

    const gap = milestone.pct - lastLabelPct;
    if (gap >= MIN_MILESTONE_LABEL_GAP) {
      visible.set(milestone.id, true);
      lastLabelPct = milestone.pct;
    } else {
      visible.set(milestone.id, false);
    }
  }

  return visible;
}

export function SupplyTimelineScrubber({
  historyDates,
  scrubIndex,
  mode,
  scrubDateLabel,
  coverageStart,
  onScrub,
  onLive,
}: SupplyTimelineScrubberProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const maxIndex = Math.max(0, historyDates.length - 1);
  const rangeEnd = todayUtcDate();
  const selectedDate =
    mode === 'live'
      ? historyDates[maxIndex]?.slice(0, 10) ?? rangeEnd
      : historyDates[scrubIndex]?.slice(0, 10) ?? rangeEnd;
  const selectedPct = calendarPctForDate(selectedDate, rangeEnd);
  const dataStartPct = coverageStart
    ? calendarPctForDate(coverageStart, rangeEnd)
    : historyDates[0]
      ? calendarPctForDate(historyDates[0], rangeEnd)
      : 100;
  const calendarValue = Math.round((selectedPct / 100) * CALENDAR_STEPS);

  const milestones = useMemo(
    () =>
      ZCASH_SUPPLY_MILESTONES.map((m) => ({
        ...m,
        pct: milestonePositionPct(m.date, ZCASH_LAUNCH_DATE, rangeEnd),
      })),
    [rangeEnd],
  );

  const showMilestoneLabel = useMemo(() => milestoneLabelVisibility(milestones), [milestones]);

  if (historyDates.length < 2) return null;

  const handleCalendarScrub = (step: number) => {
    const pct = (step / CALENDAR_STEPS) * 100;
    const targetDate = dateFromCalendarPct(pct, rangeEnd);
    onScrub(nearestIndexAtOrBefore(historyDates, targetDate));
  };

  return (
    <div
      className={`mt-4 rounded-xl border border-cipher-border/25 px-4 py-3 sm:px-5 ${
        isDark ? 'bg-black/20' : 'bg-black/[0.04]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="relative min-w-0 flex-1">
          <div className="group relative py-2.5">
            <div
              className={`relative h-2 rounded-full ring-1 ring-inset transition-shadow group-hover:ring-cipher-yellow/25 ${
                isDark ? 'bg-black/35 ring-white/12' : 'bg-black/10 ring-black/10'
              }`}
            >
              {dataStartPct > 0 ? (
                <div
                  className={`absolute inset-y-0 left-0 rounded-l-full ${
                    isDark ? 'bg-white/[0.03]' : 'bg-black/[0.04]'
                  }`}
                  style={{ width: `${dataStartPct}%` }}
                  title={
                    coverageStart
                      ? `Indexed data begins ${coverageStart}`
                      : 'Indexed data begins here'
                  }
                />
              ) : null}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cipher-yellow/35 to-cipher-yellow/55 transition-[width] duration-100"
                style={{ width: `${selectedPct}%` }}
              />
              {selectedPct > 0 ? (
                <div
                  className={`pointer-events-none absolute top-1/2 z-[2] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cipher-yellow/80 bg-cipher-yellow transition-transform group-hover:scale-110 ${
                    isDark ? 'shadow-[0_0_0_2px_rgba(0,0,0,0.45)]' : 'shadow-[0_0_0_2px_rgba(255,255,255,0.85)]'
                  }`}
                  style={{ left: `${selectedPct}%` }}
                  aria-hidden
                />
              ) : null}

              {milestones.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="absolute top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${m.pct}%` }}
                  title={`${m.label} · ${m.date}`}
                  aria-label={`Jump to ${m.label}, ${m.date}`}
                  onClick={() => {
                    onScrub(nearestIndexAtOrBefore(historyDates, m.date));
                  }}
                >
                  <span
                    className="block h-3 w-0.5 rounded-full opacity-80 hover:opacity-100"
                    style={{ backgroundColor: m.color }}
                  />
                </button>
              ))}

              <input
                type="range"
                min={0}
                max={CALENDAR_STEPS}
                value={mode === 'live' ? Math.round((selectedPct / 100) * CALENDAR_STEPS) : calendarValue}
                onChange={(e) => handleCalendarScrub(parseInt(e.target.value, 10))}
                className="absolute inset-0 z-[3] h-full w-full cursor-grab opacity-0 active:cursor-grabbing"
                aria-label="Zcash supply timeline from 2016"
              />
            </div>
          </div>

          <div className="relative mt-2 h-3.5">
            {milestones.map((m) => {
              const labelVisible = showMilestoneLabel.get(m.id) ?? false;
              if (!labelVisible) return null;
              return (
                <span
                  key={`${m.id}-label`}
                  className="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap text-[9px] font-mono text-muted"
                  style={{ left: `${m.pct}%`, color: m.color }}
                >
                  {m.label}
                </span>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onLive}
          className={`mt-0 shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-all ${
            mode === 'live'
              ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400'
              : isDark
                ? 'border-white/15 text-white/50 hover:border-white/30 hover:text-white/80'
                : 'border-black/15 text-muted hover:border-black/25 hover:text-secondary'
          }`}
        >
          <span
            className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${
              mode === 'live' ? 'bg-emerald-400 animate-pulse' : isDark ? 'bg-white/30' : 'bg-black/25'
            }`}
          />
          Live
        </button>
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono text-muted">
        <span>2016</span>
        <span>{mode === 'live' ? 'Today' : scrubDateLabel ?? 'Snapshot'}</span>
      </div>

      {coverageStart && dataStartPct > 2 ? (
        <p className="mt-1.5 text-[10px] font-mono text-muted/80">
          Supply data indexed from {coverageStart}
        </p>
      ) : null}
    </div>
  );
}
