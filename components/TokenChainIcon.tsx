'use client';

// Token icons from /public/tokens/ (sourced from zipher-app)
function getTokenIcon(symbol: string): string | null {
  const key = symbol.toLowerCase();
  const map: Record<string, string> = {
    usdc: '/tokens/usdc.png',
    usdt: '/tokens/usdt.png',
    btc: '/tokens/btc.png',
    eth: '/tokens/eth.png',
    sol: '/tokens/sol.png',
    zec: '/tokens/zec.png',
    near: '/tokens/near.png',
    bnb: '/tokens/bnb.png',
    doge: '/tokens/doge.png',
    xrp: '/tokens/xrp.png',
    matic: '/tokens/matic.png',
    pol: '/tokens/pol.png',
    avax: '/tokens/avax.png',
    trx: '/tokens/trx.png',
    dai: '/tokens/dai.png',
    link: '/tokens/link.png',
    uni: '/tokens/uni.png',
    arb: '/tokens/arb.png',
    op: '/tokens/op.png',
    apt: '/tokens/apt.png',
    sui: '/tokens/sui.png',
    ton: '/tokens/ton.png',
    ada: '/tokens/ada.png',
    shib: '/tokens/shib.png',
    pepe: '/tokens/pepe.png',
    wbtc: '/tokens/wbtc.png',
    weth: '/tokens/weth.png',
    xmr: '/tokens/xmr.png',
  };
  return map[key] || null;
}

// Chain icons from /public/chains/ (sourced from zipher-app)
function getChainIcon(chain: string): string | null {
  const key = chain.toLowerCase();
  const map: Record<string, string> = {
    eth: '/chains/eth.png',
    sol: '/chains/sol.png',
    btc: '/chains/btc.png',
    near: '/chains/near.png',
    base: '/chains/base.png',
    arb: '/chains/arb.png',
    op: '/chains/op.png',
    pol: '/chains/pol.png',
    avax: '/chains/avax.png',
    bsc: '/chains/bsc.png',
    bnb: '/chains/bsc.png',
    trx: '/chains/tron.png',
    tron: '/chains/tron.png',
    zec: '/tokens/zec.png',
    apt: '/chains/aptos.png',
    aptos: '/chains/aptos.png',
    sui: '/chains/sui.png',
    ton: '/chains/ton.png',
    doge: '/chains/doge.png',
    xrp: '/chains/xrp.png',
    bch: '/chains/bch.png',
    ltc: '/chains/ltc.png',
    stellar: '/chains/stellar.png',
    xlm: '/chains/stellar.png',
    starknet: '/chains/starknet.png',
    cardano: '/chains/cardano.png',
  };
  return map[key] || null;
}

// Skip the chain badge when the token IS the chain's native asset
const NATIVE_PAIRS: Record<string, string> = {
  eth: 'eth',
  sol: 'sol',
  btc: 'btc',
  near: 'near',
  bnb: 'bnb',
  bsc: 'bnb',
  avax: 'avax',
  doge: 'doge',
  xrp: 'xrp',
  trx: 'trx',
  zec: 'zec',
  ton: 'ton',
  apt: 'apt',
  sui: 'sui',
  ltc: 'ltc',
  ada: 'ada',
};

interface TokenChainIconProps {
  token: string;
  chain: string;
  size?: number;
  className?: string;
}

export function TokenChainIcon({ token, chain, size = 32, className = '' }: TokenChainIconProps) {
  const tokenKey = token.toLowerCase();
  const chainKey = chain.toLowerCase();
  const badgeSize = Math.max(Math.round(size * 0.5), 10);
  const isNative = NATIVE_PAIRS[chainKey] === tokenKey;
  const showBadge = !isNative && chainKey !== tokenKey;

  const tokenUrl = getTokenIcon(tokenKey) || getChainIcon(tokenKey);
  const chainUrl = getChainIcon(chainKey);

  return (
    <div className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      {tokenUrl ? (
        <img
          src={tokenUrl}
          alt={token}
          width={size}
          height={size}
          className="rounded-full"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div
          className="rounded-full flex items-center justify-center text-white font-bold bg-gray-500"
          style={{ width: size, height: size, fontSize: size * 0.4 }}
        >
          {token.charAt(0).toUpperCase()}
        </div>
      )}

      {showBadge && chainUrl && (
        <div
          className="absolute -bottom-0.5 -right-0.5 rounded-full bg-cipher-surface dark:bg-[#1a1a2e] p-[2px]"
          style={{ width: badgeSize + 4, height: badgeSize + 4 }}
        >
          <img
            src={chainUrl}
            alt={chain}
            width={badgeSize}
            height={badgeSize}
            className="rounded-full w-full h-full"
            onError={(e) => {
              (e.target as HTMLImageElement).parentElement!.style.display = 'none';
            }}
          />
        </div>
      )}
    </div>
  );
}
