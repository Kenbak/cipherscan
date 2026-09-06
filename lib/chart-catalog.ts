import { blockIntervals } from './network-overview';
import type { getChartColors } from './chart-theme';

export type ChartColor = keyof ReturnType<typeof getChartColors>;
export type ChartRow = { x: string | number; [key: string]: string | number | null };
export interface CatalogSeries { key: string; label: string; color: ChartColor; field?: string; scale?: number }
export interface CatalogChart {
  id: string; title: string; category: string; description: string; href: string;
  endpoint: string; rows: string; x: string; window: string; unit: string;
  series: CatalogSeries[]; kind?: 'bar' | 'area' | 'line'; axis?: 'category' | 'height';
  stack?: boolean; reference?: number; percent?: boolean; requireVerifiedPools?: boolean;
}
const series = (key: string, label: string, color: ChartColor, scale?: number): CatalogSeries => ({key,label,color,scale});
const flows = [series('shield','Shield in','shielding'),series('deshield','Deshield out','deshielding')];
const poolSeries = ['sprout','sapling','orchard','ironwood'].map(key => series(key,key[0].toUpperCase()+key.slice(1),key as ChartColor));
const privacy = {category:'Privacy',endpoint:'/api/privacy-stats?days=90',rows:'trends.daily',x:'date',window:'90 days',href:'/privacy#trends'};
const pools = {category:'Supply & flows',endpoint:'/api/network/pool-history?period=all',rows:'points',x:'date',window:'All available history',href:'/pools#supply'};
const valuation = {category:'Valuation',endpoint:'/api/valuation/history?period=1y',rows:'points',x:'date',window:'1 year',href:'/valuation#price'};
const metrics = {category:'Mining & network',endpoint:'/api/network/mining-metrics?window=20&limit=120',rows:'points',x:'height',axis:'height' as const,window:'20-block rolling averages · up to 120 samples',href:'/mining#economics'};
const ages = {category:'Valuation',endpoint:'/api/valuation/dormancy?period=1y',rows:'points',x:'date',window:'1 year',href:'/valuation#dormancy'};

/** Every entry declares its actual source, denominator, unit and observation window. */
export const CHART_CATALOG: CatalogChart[] = [
  {...pools,id:'pool-balances',title:'Shielded pool balances',description:'Daily balances from chain state, split by pool. These are stocks of ZEC, not daily inflows.',unit:'ZEC',series:poolSeries,kind:'area',stack:true,requireVerifiedPools:true},
  {...pools,id:'supply',title:'Issued supply',description:'Shielded and transparent balances. Future issuance and unmined supply are excluded.',unit:'ZEC',series:[series('shielded','Shielded','shielded'),series('transparent','Transparent','transparent')],kind:'area',stack:true},
  {...pools,id:'shielded-supply',title:'Shielded share of supply',description:'Shielded balance divided by issued chain supply. The 21M maximum is not the denominator.',unit:'%',series:[series('shieldedSupplyPct','Shielded share','shielded')],percent:true},
  {id:'turnstile',title:'After deshielding',category:'Supply & flows',description:'Tracked value by deshielding date and its latest observed destination. Cohort outcomes can change as funds move.',href:'/turnstile',endpoint:`/api/pools/turnstile?since=${new Date(Date.now()-30*86400000).toISOString().slice(0,10)}`,rows:'timeseries',x:'date',window:'30-day deshielding cohorts',unit:'ZEC',series:[series('held','Held','transparent'),series('reshielded','Reshielded','shielded'),series('exchange','Exchange-tagged','deshielding'),series('bridge','Bridge-tagged','purple'),series('transferred','Other transfers','sprout')],kind:'area',stack:true},
  {id:'pool-share',title:'Leading mining pool share',category:'Mining & network',description:'Largest attributed share of each day’s blocks. The leading pool may change; partial days can be volatile.',href:'/mining#hashrate',endpoint:'/api/mining/hashrate-share?period=30d',rows:'series',x:'date',window:'30 days',unit:'%',series:[series('largestShare','Largest pool share','gold')],percent:true},
  {...valuation,id:'search-interest',title:'Search interest in “zcash”',href:'/valuation#attention',endpoint:'/api/valuation/search-interest',rows:'snapshot.points',window:'Imported weekly CSV · not automatically updated',description:'Worldwide Google Trends index, normalized within its export window. Incomplete weeks are excluded. Search attention is unscored.',unit:'Index / 100',series:[series('value','Completed weeks','gold')],percent:true},
  {...privacy,id:'daily-activity',title:'Daily transaction activity',description:'Shielded and transparent transactions per day. Coinbase is excluded from the transparent count.',unit:'Transactions',series:[series('shielded','Shielded','shielded'),series('transparent','Transparent','transparent')],kind:'bar'},
  {...privacy,id:'privacy-adoption',title:'Shielded transaction share',description:'Daily shielded share of shielded plus non-coinbase transparent transactions.',unit:'%',series:[series('shieldedPercentage','Shielded share','shielded')],percent:true},
  {...privacy,id:'privacy-score',title:'Privacy Score history',description:'Recorded model scores out of 100. Formula changes can cause steps; this is not a probability of privacy.',unit:'Score / 100',series:[series('privacyScore','Privacy Score','gold')],percent:true},
  {id:'flow-volume',title:'Public shielding flows',category:'Supply & flows',description:'Daily public value entering and leaving shielded pools. Private transfers inside pools are not visible.',href:'/pools#flows',endpoint:'/api/pools/flows?period=30d&pool=all',rows:'points',x:'date',window:'30 days',unit:'ZEC',series:flows,kind:'bar'},
  {id:'net-flow',title:'Net public shielding',category:'Supply & flows',description:'Shielding minus deshielding per day. This is not the total change in shielded balances.',href:'/pools#flows',endpoint:'/api/pools/flows?period=30d&pool=all',rows:'points',x:'date',window:'30 days',unit:'ZEC',series:[series('net','Net flow','shielded')],kind:'bar',reference:0},
  {id:'flow-thresholds',title:'Flows above an amount',category:'Privacy',description:'Counts at or above each ZEC threshold. Thresholds overlap; they do not measure an anonymity set.',href:'/privacy#distribution',endpoint:'/api/analytics/anonymity-set?period=30d',rows:'thresholds',x:'thresholdZec',axis:'category',window:'30 days · thresholds in ZEC',unit:'Transactions',series:[series('shieldCount','Shield in','shielding'),series('deshieldCount','Deshield out','deshielding')],kind:'bar'},
  {id:'flow-buckets',title:'Flows by amount range',category:'Privacy',description:'Public flow counts in non-overlapping ZEC ranges. Each flow belongs to one bucket.',href:'/privacy#distribution',endpoint:'/api/analytics/shielding-distribution?period=30d',rows:'buckets',x:'label',axis:'category',window:'30 days · ranges in ZEC',unit:'Transactions',series:[series('shieldCount','Shield in','shielding'),series('deshieldCount','Deshield out','deshielding')],kind:'bar'},
  {id:'network-hashrate',title:'Estimated network hashrate',category:'Mining & network',description:'Daily mining power estimated from difficulty and block production.',href:'/mining#metrics',endpoint:'/api/network/hashrate-history?period=90d',rows:'points',x:'date',window:'90 days',unit:'GSol/s',series:[series('hashrate','Hashrate','gold',1e-9)]},
  {id:'mining-distribution',title:'Blocks by mining pool',category:'Mining & network',description:'Observed block production by attributed pool. Unidentified miners retain their source labels.',href:'/mining#distribution',endpoint:'/api/mining/pool-distribution?period=7d',rows:'pools',x:'name',axis:'category',window:'7 days',unit:'Blocks',series:[series('blocks','Blocks','gold')],kind:'bar'},
  {id:'miner-rewards',title:'Coinbase reward spending',category:'Mining & network',description:'Reward cohorts earned, subsequently moved and still held. A movement does not establish a sale.',href:'/mining#behavior',endpoint:'/api/mining/miner-behavior?period=30d',rows:'series',x:'date',window:'30 days',unit:'ZEC',series:[series('earnedZat','Earned','gold',1e-8),series('spentZat','Moved','deshielding',1e-8),series('heldZat','Held','shielding',1e-8)]},
  {...metrics,id:'block-time',title:'Recent block intervals',endpoint:'/api/network/blocks/recent?limit=30',rows:'blocks',window:'Latest 30 blocks',description:'Differences between adjacent block timestamps. Missing predecessors leave gaps; negative intervals are preserved.',unit:'Seconds',series:[series('seconds','Block interval','transparent')],reference:75,kind:'bar'},
  {...metrics,id:'difficulty',title:'Mining difficulty',description:'Difficulty averaged over 20 blocks. Sample positions use actual block heights.',unit:'Difficulty',series:[series('difficulty','Difficulty','gold')]},
  {...metrics,id:'block-fees',title:'Fees per block',description:'Total transaction fees per block, averaged over 20 blocks. Subsidy is separate.',unit:'ZEC',series:[series('txFees','Block fees','gold')]},
  {...metrics,id:'tx-per-block',title:'Transactions per block',description:'Reported transaction count averaged over 20 blocks, including coinbase.',unit:'Transactions / block',series:[series('txCount','Transactions','transparent')]},
  {id:'fees',title:'Observed transaction fees',category:'Mining & network',description:'Daily median and 10th/90th percentiles of observed fees. This is not a fee quote.',href:'/network#network-activity',endpoint:'/api/network/fee-distribution?period=30d',rows:'daily',x:'date',window:'30 days',unit:'mZEC',series:[series('p10','10th percentile','transparent',1e-5),series('median','Median','gold',1e-5),series('p90','90th percentile','sprout',1e-5)]},
  {id:'node-storage',title:'Explorer node storage',category:'Mining & network',description:'Disk usage reported by this explorer’s node. It is not a measurement of every node or only block files.',href:'/network#network-technical',endpoint:'/api/network/chain-size-history?period=1y',rows:'points',x:'time',window:'1 year',unit:'GiB',series:[series('sizeGB','Node disk usage','transparent')]},
  ...(['Commitments','Nullifiers'] as const).map(metric => ({id:`protocol-${metric.toLowerCase()}`,title:metric==='Commitments'?'Shielded note commitments':'Shielded nullifiers',category:'Mining & network',description:metric==='Commitments'?'Cumulative Sapling outputs and Orchard/Ironwood actions. Includes padding; these are not unique people or wallets.':'Sapling spends and Orchard/Ironwood action counts. Actions can include dummy spends; these are not counts of real transfers.',href:'/network#network-technical',endpoint:'/api/network/protocol-stats',rows:'history',x:'month',window:'All available history',unit:'Entries',series:['sapling','orchard','ironwood'].map(pool=>series(pool+metric,pool[0].toUpperCase()+pool.slice(1),pool as ChartColor))})),
  {...valuation,id:'price-vs-realized',title:'Price and modeled realized price',description:'Daily historical USD price and modeled cost basis. These are daily observations, not a live quote.',unit:'USD / ZEC',series:[series('priceUsd','Market price','gold'),series('realizedPrice','Modeled realized price','purple')]},
  {...valuation,id:'mvrv',title:'MVRV',href:'/valuation#mvrv',description:'Market capitalization divided by modeled realized capitalization. 1× is not a fair-value threshold.',unit:'Multiple',series:[series('mvrv','MVRV','gold')],reference:1},
  {...valuation,id:'nupl',title:'Modeled unrealized profit / loss',href:'/valuation#nupl',description:'NUPL = 1 − 1/MVRV. Another view of the same model, not an independent confirming signal.',unit:'%',series:[series('nupl','NUPL','shielding',100)],reference:0},
  {...valuation,id:'sopr',title:'SOPR · transparent spends',href:'/valuation#sopr',description:'Spent-output value relative to its creation value. Only the transparent-spend series is shown; missing data stays unavailable.',unit:'Ratio',series:[series('sopr','SOPR','deshielding')],reference:1},
  {...valuation,id:'realized-cap',title:'Market and modeled realized cap',description:'Daily reported market capitalization alongside the modeled realized capitalization estimate.',unit:'USD',series:[series('marketCapUsd','Market cap','gold'),series('realizedCapUsd','Modeled realized cap','purple')]},
  {...ages,id:'dormancy',title:'Age of spent ZEC',description:'Value-weighted age of transparent ZEC spent per day. Shielded note ages are not observable.',unit:'Days',series:[series('avgDormancy','Average age','deshielding')]},
  {...ages,id:'coin-days',title:'Coin-days destroyed',description:'Transparent value moved × output age, summed per day. Spikes do not prove selling.',unit:'ZEC-days',series:[series('cdd','Coin-days destroyed','deshielding')],kind:'bar'},
  {...valuation,id:'hodl-waves',title:'Unspent ZEC by output age',href:'/valuation#hodl-waves',endpoint:'/api/valuation/hodl-waves?period=1y',description:'Transparent ZEC by time since output creation. Output age is not the age of an owner’s position.',unit:'ZEC',series:[series('gt2y','2y+','purple'),series('b1_2y','1–2y','sprout'),series('b6_12m','6–12m','transparent'),series('b3_6m','3–6m','sapling'),series('b1_3m','1–3m','deshielding'),series('lt1m','<1m','gold')],kind:'area',stack:true},
  {id:'swap-volume',title:'Cross-chain swap volume',category:'Cross-chain',description:'Observed ZEC-related swaps through indexed providers, valued in USD. This is not all exchange activity.',href:'/crosschain',endpoint:'/api/crosschain/trends?period=30d&granularity=daily',rows:'data',x:'date',window:'30 days',unit:'USD',series:[series('inflowVolume','Into ZEC','shielding'),series('outflowVolume','Out of ZEC','deshielding')],kind:'bar'},
  {id:'swap-count',title:'Cross-chain swap activity',category:'Cross-chain',description:'Observed swaps into and out of ZEC through indexed providers. Coverage is limited to those providers.',href:'/crosschain',endpoint:'/api/crosschain/trends?period=30d&granularity=daily',rows:'data',x:'date',window:'30 days',unit:'Swaps',series:[series('inflowCount','Into ZEC','shielding'),series('outflowCount','Out of ZEC','deshielding')],kind:'bar'},
];

function numeric(value: unknown): number | null {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}
/** Missing values are gaps. Zero remains zero; source strings are converted only when numeric. */
export function catalogRows(chart: CatalogChart, payload: unknown): ChartRow[] {
  if (!payload || typeof payload !== 'object' || (payload as {success?: boolean}).success === false) return [];
  let raw: unknown = payload;
  for (const key of chart.rows.split('.')) raw = raw && typeof raw === 'object' ? (raw as Record<string,unknown>)[key] : null;
  if (!Array.isArray(raw)) return [];
  if (chart.id === 'block-time') raw = blockIntervals(raw as {height:number;timestamp:number}[]);
  if (!Array.isArray(raw)) return [];
  if (chart.requireVerifiedPools && !(payload as {hasVerifiedPerPoolBreakdown?:boolean}).hasVerifiedPerPoolBreakdown) return [];
  const rows: ChartRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const p = {...item} as Record<string,unknown>;
    if (chart.id === 'search-interest' && p.partial) continue;
    if (chart.id === 'pool-share') {
      const values = p.pools && typeof p.pools === 'object' ? Object.values(p.pools).map(numeric).filter((n): n is number => n != null && n >= 0 && n <= 1) : [];
      p.largestShare = values.length ? Math.max(...values)*100 : null;
    }
    const sourceX = p[chart.x];
    if (sourceX == null) continue;
    const x = chart.axis === 'category' ? String(sourceX) : chart.axis === 'height' ? numeric(sourceX) : typeof sourceX === 'number' ? (sourceX < 1e12 ? sourceX * 1000 : sourceX) : Date.parse(String(sourceX));
    if (x == null || (typeof x === 'number' && !Number.isFinite(x))) continue;
    const row: ChartRow = {x};
    for (const s of chart.series) {
      const value = numeric(p[s.field ?? s.key]);
      row[s.key] = chart.id === 'sopr' && p.soprSource !== 'transparent_spends' ? null : value == null ? null : value * (s.scale ?? 1);
    }
    rows.push(row);
  }
  return chart.axis === 'category' ? rows : rows.sort((a,b)=>Number(a.x)-Number(b.x));
}
export function formatCatalogValue(value: number, unit: string, compact = false) {
  const number = new Intl.NumberFormat('en-US',{notation:compact?'compact':'standard',...(compact?{maximumSignificantDigits:3}:{maximumFractionDigits:unit==='ZEC'?6:3})}).format(value);
  return unit === '%' ? `${number}%` : unit === 'Multiple' || unit === 'Ratio' ? `${number}×` : number;
}
