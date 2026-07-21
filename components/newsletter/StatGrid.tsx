import type { ParsedTable } from '@/lib/newsletter';
import { inlineMarkdown } from '@/lib/newsletter';

interface StatGridProps {
  tables: ParsedTable[];
  editorial?: string;
}

function parseChange(value: string): { value: string; direction: 'up' | 'down' | 'flat' | null } {
  const upMatch = value.match(/\+([\d.]+%?)/);
  const downMatch = value.match(/(-[\d.]+%?)/);
  if (upMatch) return { value, direction: 'up' };
  if (downMatch && !value.includes('(+')) return { value, direction: 'down' };
  if (value.includes('~flat') || value.includes('Stable') || value.includes('—')) {
    return { value, direction: 'flat' };
  }
  return { value, direction: null };
}

function StatCard({ label, value }: { label: string; value: string }) {
  const { direction } = parseChange(value);
  const changeClass =
    direction === 'up'
      ? 'text-cipher-green'
      : direction === 'down'
        ? 'text-danger'
        : 'text-muted';

  return (
    <div className="nl-stat-card">
      <p
        className="nl-stat-label"
        dangerouslySetInnerHTML={{ __html: inlineMarkdown(label) }}
      />
      <p
        className={`nl-stat-value ${direction ? changeClass : ''}`}
        dangerouslySetInnerHTML={{ __html: inlineMarkdown(value) }}
      />
    </div>
  );
}

export function StatGrid({ tables, editorial }: StatGridProps) {
  return (
    <div className="nl-stat-grid-wrap">
      {tables.map((table, ti) => (
        <div key={ti} className="nl-stat-grid">
          {table.rows.map((row, ri) => {
            const label = row[0] ?? '';
            const value = row[1] ?? row.slice(1).join(' · ');
            const change = row[2];

            return (
              <StatCard
                key={ri}
                label={label}
                value={change ? `${value} · ${change}` : value}
              />
            );
          })}
        </div>
      ))}
      {editorial && (
        <p
          className="nl-editorial"
          dangerouslySetInnerHTML={{ __html: inlineMarkdown(editorial) }}
        />
      )}
    </div>
  );
}
