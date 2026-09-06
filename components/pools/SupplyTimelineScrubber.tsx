'use client';

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
  if (historyDates.length < 2) return null;
  const index = Math.max(0, Math.min(scrubIndex, historyDates.length - 1));
  return <div className="mt-5 border-t border-cipher-border pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
      <div className="text-caption font-mono text-muted">SUPPLY HISTORY <span className="block sm:inline sm:ml-3 text-secondary">{mode === 'live' ? 'Latest available snapshot' : scrubDateLabel}</span></div>
      <button type="button" onClick={onLive} aria-pressed={mode === 'live'} className="rounded-md border border-cipher-border px-3 py-2 text-caption font-mono text-secondary hover:bg-glass-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cipher-gold">Latest snapshot</button>
    </div>
    <input type="range" min={0} max={historyDates.length - 1} step={1} value={index}
      aria-label="Historical supply snapshot" aria-valuetext={dateLabel(historyDates[index])}
      onChange={event => onScrub(Number(event.target.value))}
      className="block w-full h-6 cursor-pointer accent-cipher-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-cipher-gold" />
    <div className="mt-2 flex justify-between gap-3 text-caption font-mono text-muted"><span>{dateLabel(historyDates[0])}</span><span>{dateLabel(historyDates[historyDates.length - 1])}</span></div>
    <p className="mt-2 text-caption text-muted">Daily snapshots with complete supply totals. Drag or use the arrow keys to explore recorded dates.</p>
  </div>;
}
