'use client';
import { useTheme } from '@/contexts/ThemeContext';
import { getChartColors } from '@/lib/chart-theme';
import { ValuationChart } from './ValuationChart';
import { useApiQuery } from '@/hooks/useApiQuery';
interface SearchSnapshot { capturedAt:string; importedAt:string; points:{date:string;value:number|null;belowOne:boolean;partial:boolean}[] }


export const GOOGLE_TRENDS_URL = 'https://trends.google.com/trends/explore?date=today%2012-m&q=zcash&hl=en';
const formatDate = (date: string) => new Date(date).toLocaleDateString('en-US', {year:'numeric',month:'short',day:'numeric',timeZone:'UTC'});

export function SearchInterest() {
  const { theme } = useTheme(); const c = getChartColors(theme);
  const {data,loading,error}=useApiQuery<{snapshot:SearchSnapshot|null}>('/v1/valuation/search-interest',undefined,{refreshInterval:300_000});
  const trends=data?.snapshot;
  const complete = (trends?.points??[]).filter(p => !p.partial);
  const latest = complete.at(-1);
  const partial = (trends?.points??[]).find(p => p.partial);
  // Connect the provisional segment to the last complete week without treating it as complete.
  const chartData = (trends?.points??[]).map(p => ({date:p.date, interest:p.partial?null:p.value, provisional:p.partial||p.date===latest?.date?p.value:null}));
  return <ValuationChart
    title="Search interest in “zcash”"
    description="Worldwide · weekly Google Trends index. Each export is scaled from 0 to 100 within its own window; this is relative search attention, not search volume or buying demand."
    data={chartData} loading={loading} format={v=>v.toFixed(0)} domain={[0,100]}
    series={[{key:'interest',label:'Completed weeks',color:c.gold},{key:'provisional',label:'Incomplete week',color:c.transparent,dashed:true}]}
    controls={<a href={GOOGLE_TRENDS_URL} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-secondary">Open Google Trends ↗</a>}
    footer={<>{error && trends && <span className="block mb-2">Refresh failed; showing the last stored snapshot.</span>}{!loading && !trends && <span className="block mb-2">No search-interest snapshot is available from the server yet.</span>}<span className="block font-mono text-secondary mb-2">CSV snapshot · captured {trends?formatDate(trends.capturedAt):'unavailable'} · latest complete week starts {latest?formatDate(latest.date):'—'}</span>{partial && <>Week starting {formatDate(partial.date)} is incomplete and excluded from signal calculations. </>}Manually imported history; automatic daily updates are not connected. Search attention is unscored until a reliable feed and historical validation are available. Source: <a href={GOOGLE_TRENDS_URL} className="underline underline-offset-4">Google Trends</a>.</>}
  />;
}
