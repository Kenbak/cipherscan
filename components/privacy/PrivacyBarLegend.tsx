'use client';

export function PrivacyBarLegend({
  shieldColor,
  deshieldColor,
}: {
  shieldColor: string;
  deshieldColor: string;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] font-mono text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: shieldColor }} aria-hidden />
        Shield (in)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: deshieldColor }} aria-hidden />
        Deshield (out)
      </span>
    </div>
  );
}
