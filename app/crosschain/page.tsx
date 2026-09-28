import Link from "next/link";
import { buildPageMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/ui/SectionHeader";
import { isMainnet } from "@/lib/config";
import { CrosschainDashboard } from "@/components/crosschain/CrosschainDashboard";

type Search = Promise<Record<string, string | string[] | undefined>>;
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Search;
}) {
  const query = await searchParams;
  return buildPageMetadata({
    title: "ZEC Cross-Chain Swap Analytics | ZecBlock",
    description:
      "Explore indexed ZEC swaps through NEAR Intents: historical volume, routes, observed outcomes and both transaction legs, with explicit data coverage.",
    path: "/crosschain",
    networks: ["mainnet"],
    index: Object.keys(query).length === 0,
  });
}
export default async function CrosschainPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const query = await searchParams;
  const allowed = [
    "period",
    "direction",
    "status",
    "chain",
    "token",
    "search",
    "minUsd",
    "maxUsd",
    "from",
    "to",
    "cursor",
    "sourceAsset",
    "destAsset",
    "referral",
  ];
  const params = Object.fromEntries(
    allowed.flatMap((key) =>
      typeof query[key] === "string" && query[key]
        ? [[key, query[key] as string]]
        : [],
    ),
  );
  if (!isMainnet) {
    return (
      <div className="min-h-screen py-8 sm:py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="card text-center py-12">
            <h1 className="type-page font-mono text-secondary mb-4">
              Cross-Chain Available on Mainnet Only
            </h1>
            <p className="text-muted max-w-lg mx-auto mb-6">
              NEAR Intents cross-chain swaps are only available for ZEC mainnet.
            </p>
            <div className="flex justify-center gap-4">
              <a
                href="https://zecblock.com/crosschain"
                className="px-4 py-2 bg-cipher-green/20 border border-cipher-green text-cipher-green rounded-lg hover:bg-cipher-green/30 transition-colors font-mono text-sm"
              >
                View on Mainnet
              </a>
              <Link
                href="/"
                className="px-4 py-2 bg-cipher-surface/30 border border-cipher-border text-secondary rounded-lg hover:border-cipher-gold transition-colors font-mono text-sm"
              >
                Back to Explorer
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          eyebrow="CROSSCHAIN"
          title="ZEC Cross-Chain Analytics"
          subtitle={
            <span className="text-muted">
              Follow ZEC moving between chains through{" "}
              <a
                href="https://near.org/intents"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cipher-gold hover:underline"
              >
                NEAR Intents
              </a>
            </span>
          }
          actions={
            <a
              href="https://cipherswap.app/"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-caption font-mono text-secondary border border-cipher-border rounded-full hover:border-glass-10 hover:bg-glass-3 transition-colors whitespace-nowrap"
            >
              Buy ZEC on CipherSwap
              <svg
                className="w-3 h-3 text-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          }
        />

        <CrosschainDashboard key={JSON.stringify(params)} params={params} />
      </div>
    </div>
  );
}
