import Link from 'next/link';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui/SectionHeader';
import { PageSectionNav } from '@/components/PageSectionNav';
import { getBaseUrl } from '@/lib/seo';
import styles from './learn.module.css';

const sections = [
  { id: 'start', label: 'Start here' },
  { id: 'wallets', label: 'Wallets' },
  { id: 'get-zec', label: 'Get ZEC' },
  { id: 'privacy', label: 'Privacy basics' },
  { id: 'build', label: 'Build & run a node' },
  { id: 'resources', label: 'Resources' },
];

type Resource = { name: string; description: string; href: string };
const nodes: Resource[] = [
  { name: 'Zakura', description: 'Zcash full node with block pruning, snapshots and a zcashd compatibility mode.', href: 'https://zakura.com/' },
  { name: 'Zebra', description: 'Rust full node from the Zcash Foundation. Independently verify the chain.', href: 'https://github.com/ZcashFoundation/zebra' },
  { name: 'Zaino', description: 'Zcash indexing infrastructure from Zingolabs for wallet and application services.', href: 'https://github.com/zingolabs/zaino' },
  { name: 'lightwalletd', description: 'Backend service that supplies compact blockchain data to light wallets.', href: 'https://github.com/zcash/lightwalletd' },
];
const development: Resource[] = [
  { name: 'ZecBlock API', description: 'Explorer endpoints, data definitions and integration examples.', href: '/docs' },
  { name: 'librustzcash', description: 'Rust libraries for Zcash transactions, keys and wallet functionality.', href: 'https://github.com/zcash/librustzcash' },
  { name: 'Zingolib', description: 'Light-wallet library for building Zcash applications.', href: 'https://github.com/zingolabs/zingolib' },
  { name: 'Protocol & ZIPs', description: 'Protocol specifications and Zcash Improvement Proposals.', href: 'https://zips.z.cash/' },
];
const community: Resource[] = [
  { name: 'Zcash learning hub', description: 'Guides to Zcash, its technology and the wider ecosystem.', href: 'https://z.cash/learn/' },
  { name: 'Zechub', description: 'Community-maintained explainers, tutorials and educational resources.', href: 'https://zechub.wiki/' },
  { name: 'Community forum', description: 'Join protocol, governance and ecosystem discussions.', href: 'https://forum.zcashcommunity.com/' },
  { name: 'Zcash Foundation', description: 'Open-source infrastructure, research and community support.', href: 'https://zfnd.org/' },
  { name: 'Shielded Labs', description: 'Independent development and research for Zcash.', href: 'https://shieldedlabs.net/' },
  { name: 'Zcash Community Grants', description: 'Funding for projects that advance the Zcash ecosystem.', href: 'https://zcashcommunitygrants.org/' },
];

function Arrow({ external = false }: { external?: boolean }) {
  return <span aria-hidden="true">{external ? '↗' : '→'}</span>;
}
function Destination({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return href.startsWith('/')
    ? <Link href={href} className={className}>{children}</Link>
    : <a href={href} className={className} target="_blank" rel="noopener noreferrer">{children}<span className="sr-only"> (opens in a new tab)</span></a>;
}
function ResourceList({ items }: { items: Resource[] }) {
  return <ul className={styles.resourceList}>{items.map(item => <li key={item.href}>
    <Destination href={item.href} className={styles.resource}>
      <span><strong>{item.name}</strong><span className={styles.description}>{item.description}</span></span>
      <Arrow external={!item.href.startsWith('/')} />
    </Destination>
  </li>)}</ul>;
}
function SectionTitle({ number, title, description }: { number: string; title: string; description: string }) {
  return <div className={styles.sectionTitle}><span className={styles.number}>{number}</span><div><h2>{title}</h2><p>{description}</p></div></div>;
}
function Shield() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="24" height="24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" /><path d="m8 12 3 3 5-6" /></svg>;
}

export default function LearnPage() {
  const base = getBaseUrl();
  const schema = {
    '@context': 'https://schema.org', '@type': 'WebPage', '@id': `${base}/learn#webpage`,
    url: `${base}/learn`, name: 'Learn Zcash: wallets, privacy and resources',
    description: 'Understand shielded Zcash, choose a wallet, get ZEC and explore tools for building on the network.',
    isPartOf: { '@id': `${base}/#website` }, publisher: { '@id': 'https://zecblock.com/#organization' },
    about: { '@type': 'Thing', name: 'Zcash' },
  };
  return <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 ${styles.page}`}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }} />
    <PageHeader eyebrow="LEARN_ZCASH" title="Learn Zcash" subtitle="Zcash is a digital currency with optional transaction privacy. Learn how shielding works, choose a wallet and find your way around the ecosystem." />
    <PageSectionNav sections={sections} ariaLabel="Learn Zcash sections" />

    <section id="start" className={styles.section}>
      <div className={styles.introGrid}>
        <div className={styles.intro}>
          <span className={styles.eyebrow}>Zcash, in a minute</span>
          <h2>Same currency.<br />A choice in what you share.</h2>
          <p>ZEC can move through transparent addresses or shielded pools. Shielded-to-shielded payments keep the sender, recipient and amount private on the public blockchain.</p>
          <p>Zero-knowledge proofs let the network verify those payments without publishing their private details.</p>
          <a href="#privacy" className={styles.textLink}>Understand the privacy model <Arrow /></a>
        </div>
        <figure className={styles.comparison}>
          <div className={styles.comparisonHeading}><span>On the public blockchain</span><Shield /></div>
          <table className={styles.comparisonTable}><caption className="sr-only">Visibility of transparent and fully shielded payment details</caption><thead><tr><th scope="col">Payment details</th><th scope="col">Transparent</th><th scope="col" className={styles.gold}>Fully shielded</th></tr></thead><tbody>
          {['Addresses', 'Amount'].map(label => <tr key={label}><th scope="row">{label}</th><td>Visible</td><td className={styles.gold}>Private</td></tr>)}
          <tr><th scope="row">Validity</th><td>Verified</td><td>Verified</td></tr></tbody></table>
          <figcaption>Shielding and deshielding expose public boundary amounts. Transaction existence, fees and some metadata remain visible.</figcaption>
          <span className={styles.watermark}>zecblock.com</span>
        </figure>
      </div>
      <ol className={styles.steps} aria-label="Get started with Zcash">
        <li><a href="#wallets"><span className={styles.stepIndex}>01</span><span><strong>Choose a wallet</strong><span>Keep your keys. Receive shielded ZEC.</span></span><Arrow /></a></li>
        <li><a href="#get-zec"><span className={styles.stepIndex}>02</span><span><strong>Get some ZEC</strong><span>Swap crypto or receive a payment.</span></span><Arrow /></a></li>
        <li><a href="#privacy"><span className={styles.stepIndex}>03</span><span><strong>Make a private payment</strong><span>Use a shielded balance and recipient.</span></span><Arrow /></a></li>
      </ol>
    </section>

    <section id="wallets" className={styles.section}>
      <SectionTitle number="01" title="Your wallet comes first" description="Two featured ways to hold your own keys and use shielded Zcash." />
      <div className={styles.twoColumns}>
        <article className={styles.wallet}>
          <div className={styles.walletHeading}><h3>Zodl</h3><span className={styles.meta}>iOS · Android</span></div>
          <p>A mobile Zcash wallet from ZODL, formerly called Zashi. Receive payments, shield a transparent balance and send encrypted notes.</p>
          <div className={styles.features}><span>Self-custody</span><span>Shielded payments</span><span>In-wallet swaps</span></div>
          <Destination href="https://zodl.com/download/" className={styles.button}>Get Zodl <Arrow external /></Destination>
        </article>
        <article className={styles.wallet}>
          <div className={styles.walletHeading}><h3>Vizor</h3><span className={styles.meta}>Mobile · Desktop</span></div>
          <p>A Zcash wallet from the team behind Keplr. Manage shielded payments, contacts and multiple accounts across mobile and desktop.</p>
          <div className={styles.features}><span>Self-custody</span><span>Shielded payments</span><span>In-wallet swaps</span></div>
          <Destination href="https://vizor.cash/" className={styles.button}>Get Vizor <Arrow external /></Destination>
        </article>
      </div>
      <div className={styles.sectionNote}><p>Back up your recovery phrase offline. It controls your funds; ZecBlock never needs it.</p><Destination href="https://github.com/zingolabs" className={styles.textLink}>Also explore Zingo <Arrow external /></Destination></div>
    </section>

    <section id="get-zec" className={styles.section}>
      <SectionTitle number="02" title="Get ZEC into your wallet" description="Start with your wallet’s receive address, then choose how to fund it." />
      <div className={styles.funding}>
        <div className={styles.fundingMain}>
          <span className={styles.eyebrow}>Swap into Zcash</span>
          <h3>Get ZEC with CipherSwap</h3>
          <p>Swap crypto from another chain into ZEC, powered by NEAR Intents. Choose your asset, review the quote and provide a compatible Zcash receive address.</p>
          <Destination href="https://cipherswap.app/" className={`${styles.button} ${styles.primaryButton}`}>Open CipherSwap <Arrow external /></Destination>
          <p className={styles.small}>The source-chain payment can remain public. Receiving ZEC does not make the entire cross-chain swap private.</p>
        </div>
        <div className={styles.fundingAside}>
          <h3>Already have a way to get ZEC?</h3>
          <p>Receive a payment, use your wallet’s swap feature, or withdraw from a service that supports Zcash.</p>
          <ol><li>Copy the receive address from your wallet.</li><li>Check the service supports its address type and the correct network.</li><li>If it arrives as transparent ZEC, shield it in your wallet before making a private payment.</li></ol>
          <p className={styles.small}>Review fees, the final receive amount and any provider requirements before confirming.</p>
        </div>
      </div>
    </section>

    <section id="privacy" className={styles.section}>
      <SectionTitle number="03" title="Understand what stays private" description="The essentials first. Open a topic when you want the detail." />
      <div className={styles.twoColumns}>
        <div className={styles.basics}>
          <h3>Three ways ZEC moves</h3>
          <div className={styles.flow}><span>Transparent</span><span aria-hidden="true">→</span><strong>Shielded</strong><span className={styles.flowLabel}>Shielding</span></div>
          <div className={styles.flow}><strong>Shielded</strong><span aria-hidden="true">→</span><strong>Shielded</strong><span className={styles.flowLabel}>Private payment</span></div>
          <div className={styles.flow}><strong>Shielded</strong><span aria-hidden="true">→</span><span>Transparent</span><span className={styles.flowLabel}>Deshielding</span></div>
          <p>Entering or leaving a pool exposes the public side of the transaction. Transfers inside a shielded pool are not a visible address-to-address trail.</p>
          <Link href="/privacy" className={styles.textLink}>Explore shielded pools <Arrow /></Link>
          <span className={styles.watermark}>zecblock.com</span>
        </div>
        <div className={styles.details}>
          <details><summary>Which address should I use?</summary><div><p>Use the receive address your wallet recommends. A Unified Address can bundle multiple receiver types; the sender’s wallet chooses a compatible receiver. The prefix alone does not guarantee a fully shielded payment.</p><dl className={styles.addressTypes}><div><dt>Unified</dt><dd><code>u1</code> mainnet · <code>utest1</code> testnet</dd></div><div><dt>Sapling</dt><dd><code>zs</code> mainnet · <code>ztestsapling</code> testnet</dd></div><div><dt>Transparent</dt><dd><code>t1 / t3</code> mainnet · <code>tm / t2</code> testnet</dd></div></dl><p>These are prefixes, not payment addresses. Confirm shielded delivery in your wallet before sending.</p></div></details>
          <details><summary>What are the different shielded pools?</summary><div><p>Sprout, Sapling, Orchard and Ironwood are generations of Zcash’s shielded value pools. They hold the same currency, ZEC, with different protocol capabilities and wallet support.</p><p>Balances and movements at pool boundaries are public aggregates. They do not expose individual shielded balances.</p><Link href="/ironwood" className={styles.textLink}>Explore Ironwood <Arrow /></Link></div></details>
          <details><summary>What can an explorer actually see?</summary><div><p>Transparent addresses have public balances and activity. Shielded addresses do not have a publicly queryable balance or transaction history.</p><p>Similar amounts and timing around pool boundaries can suggest a possible link, but cannot prove a transfer or common ownership.</p><Link href="/privacy-risks" className={styles.textLink}>Understand public privacy signals <Arrow /></Link></div></details>
          <details><summary>Encrypted memos and viewing keys</summary><div><p>Shielded payments can include encrypted memos. A compatible viewing key can disclose the activity it covers without granting spending authority. Treat it as sensitive financial information.</p><p>You do not need to share a key to use an explorer. If you choose to inspect your own encrypted transaction, use the dedicated tool and read its key-handling explanation.</p><Link href="/decrypt" className={styles.textLink}>Open memo decryption <Arrow /></Link></div></details>
          <details><summary>Does shielding hide my internet connection?</summary><div><p>On-chain privacy and network privacy are separate. Wallet servers and other network services may see connection metadata such as an IP address.</p><p>Tools such as Tor or Nym can address parts of that exposure, depending on how your wallet connects.</p><div className={styles.inlineLinks}><Destination href="https://www.torproject.org/" className={styles.textLink}>Tor <Arrow external /></Destination><Destination href="https://nym.com/" className={styles.textLink}>Nym <Arrow external /></Destination></div></div></details>
        </div>
      </div>
    </section>

    <section id="build" className={styles.section}>
      <SectionTitle number="04" title="Build on Zcash. Verify it yourself." description="Full nodes verify the chain. Indexers and libraries help applications use it." />
      <div className={styles.twoColumns}>
        <div className={styles.directory}><h3>Nodes & indexing</h3><ResourceList items={nodes} /></div>
        <div className={styles.directory}><h3>APIs, libraries & specifications</h3><ResourceList items={development} /></div>
      </div>
      <div className={styles.sectionNote}><p>Developing an integration? Use testnet coins and addresses for testing; they are separate from mainnet ZEC.</p><Destination href="https://testnet.cipherscan.app/" className={styles.textLink}>Open testnet explorer <Arrow external /></Destination></div>
    </section>

    <section id="resources" className={styles.section}>
      <SectionTitle number="05" title="Keep exploring" description="People, projects and references to help you go further." />
      <div className={styles.twoColumns}>
        <div className={styles.directory}><h3>Learn & discuss</h3><ResourceList items={community.slice(0, 3)} /></div>
        <div className={styles.directory}><h3>Contribute & support</h3><ResourceList items={community.slice(3)} /></div>
      </div>
      <div className={styles.related}>
        <ResourceList items={[
          { name: 'Zcash Names', description: 'Learn about human-readable Zcash names and join the project’s waitlist.', href: 'https://www.zcashnames.com/waitlist' },
          { name: 'Network nodes', description: 'See observed peers and the software they run.', href: '/network/nodes' },
          { name: 'Charts', description: 'Explore and share Zcash network data.', href: '/charts' },
          { name: 'Weekly newsletter', description: 'Catch up on Zcash and network developments.', href: '/newsletter' },
        ]} />
      </div>
    </section>
  </div>;
}
