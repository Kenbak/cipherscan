export type WatermarkSize = 'sm' | 'md' | 'lg' | 'map';

/** One quiet attribution, outside plot labels and controls. Included in image captures. */
export function ChartWatermark({className='',label='zecblock.com',size}: {className?:string;label?:string;size?:WatermarkSize}) {
  return <div aria-hidden="true" className={`chart-signature ${size==='map'?'absolute bottom-3 right-3 z-10 pointer-events-none rounded bg-cipher-surface/90 px-2 py-1':''} ${className}`}>{label}</div>;
}
