interface TimeHoverProps {
  relative: string;
  absolute: string;
}

/** Relative time; absolute date shown on hover. */
export function TimeHover({ relative, absolute }: TimeHoverProps) {
  return (
    <span className="relative inline-block group/time">
      <span className="text-secondary border-b border-dotted border-cipher-border cursor-default">{relative}</span>
      <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 text-[10px] font-mono tooltip-content whitespace-nowrap opacity-0 pointer-events-none group-hover/time:opacity-100 transition-opacity">
        {absolute}
      </span>
    </span>
  );
}
