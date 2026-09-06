'use client';

import { supplyMilestoneMarkers } from '@/lib/zcash-milestones';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { isMainnet } from '@/lib/config';

interface Props {
  historyDates: string[];
  scrubIndex: number;
  mode: 'live' | 'scrub';
  scrubDateLabel: string | null;
  onScrub: (index: number) => void;
  onLive: () => void;
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function SupplyTimelineScrubber({ historyDates, scrubIndex, mode, scrubDateLabel, onScrub, onLive }: Props) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  if (historyDates.length < 2) return null;
  const milestones = isMainnet ? supplyMilestoneMarkers(historyDates) : [];
  const index = Math.max(0, Math.min(scrubIndex, historyDates.length - 1));
  return <div className="mt-5 border-t border-cipher-border pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
      <div className="text-caption font-mono text-muted">SUPPLY HISTORY <span className="block sm:inline sm:ml-3 text-secondary">{mode === 'live' ? 'Latest available snapshot' : scrubDateLabel}</span></div>
      <button type="button" onClick={onLive} aria-pressed={mode === 'live'} className="rounded-md border border-cipher-border px-3 py-2 text-caption font-mono text-secondary hover:bg-glass-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cipher-gold">Latest snapshot</button>
    </div>
    <div className="relative">
    <input type="range" min={0} max={historyDates.length - 1} step={1} value={index}
      aria-label="Historical supply snapshot" aria-valuetext={dateLabel(historyDates[index])}
      onChange={event => onScrub(Number(event.target.value))}
      className="block w-full h-6 cursor-pointer accent-cipher-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-cipher-gold" />
    <div className="pointer-events-none absolute inset-x-2 inset-y-0" aria-hidden="true">{milestones.map(m => <span key={m.id} className="absolute top-1 h-4 w-0.5 rounded" style={{ left: `${m.percent}%`, background: colors[m.id] }} />)}</div>
    </div>
    <div className="mt-2 flex justify-between gap-3 text-caption font-mono text-muted"><span>{dateLabel(historyDates[0])}</span><span>{dateLabel(historyDates[historyDates.length - 1])}</span></div>
    {milestones.length > 0 && <>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:relative sm:mx-2 sm:block sm:h-16">
        {milestones.map(m => <div key={m.id} className="sm:absolute sm:top-0" style={{ left: `${m.percent}%` }}>
          <button type="button" onClick={() => onScrub(m.index)}
            title={`Activated at mainnet block ${m.height.toLocaleString('en-US')}. Jump to ${dateLabel(historyDates[m.index])}.`}
            aria-label={`${m.label} activation, ${dateLabel(m.date)}. Show first available snapshot.`}
            className={`w-full rounded-md px-3 py-2 text-left hover:bg-glass-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cipher-gold sm:w-auto sm:whitespace-nowrap ${m.percent > 85 ? 'sm:-translate-x-full' : m.percent < 15 ? 'sm:-translate-x-3' : 'sm:-translate-x-1/2'}`}>
            <span className="flex items-center gap-2 text-caption text-secondary"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colors[m.id] }} />{m.label}</span>
            <span className="mt-1 block text-caption font-mono text-muted">{dateLabel(m.date)}</span>
          </button>
        </div>)}
      </div>
      <p className="mt-2 text-caption text-muted">Pool activations · UTC. Select a pool to jump to its first available snapshot on or after activation.</p>
    </>}
    <p className="mt-2 text-caption text-muted">Daily snapshots with complete supply totals. Drag or use the arrow keys to explore recorded dates.</p>
  </div>;
}
