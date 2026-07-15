# SEO editorial review

Status: mixed review. Buy ZEC ownership and Ironwood claims/copy are approved;
the remaining titles, descriptions, and homepage headings are applied on the
SEO review branch so they can be inspected in context and remain open to
editorial revision. Newsletter body copy and summaries have not been changed
unless noted under resolved links.

## Priorities and copy principles

1. Establish `CipherScan` as the unambiguous site and product entity.
2. Make the homepage the strongest result for `Zcash`, `Zcash explorer`, and `Zcash block explorer` without repeating those phrases unnaturally.
3. Send `Buy ZEC` and `Buy Zcash` authority to CipherSwap, CipherScan's sister site; do not publish a competing purchase page or guide on CipherScan.
4. Make one data-rich page authoritative for `Zcash Ironwood`, `Ironwood Zcash`, `NU6.3`, and Orchard-to-Ironwood migration searches.
5. Give each tool and data page one clear search intent, with unique title, H1, description, and visible introduction.
6. Give testnet pages their own intent around `Zcash testnet` and `TAZ`; do not reuse mainnet copy.
7. Put complete transaction hashes, block hashes, addresses, names, and public keys in server-rendered content and structured data so exact-identifier searches can match them.
8. Use approved title/description copy for Open Graph and Twitter metadata unless a shorter social variant is explicitly approved.

## Buy ZEC ownership — resolved

CipherSwap is CipherScan's sister site and owns both transactional and
informational `Buy ZEC` / `Buy Zcash` intent. CipherScan will not publish a
`/buy-zec`, `/buy-zcash`, or competing purchase guide. Followed links in the
mainnet navigation, footer, retired `/swap` redirect, and relevant cross-chain
context send users and authority directly to CipherSwap. CipherSwap remains a
separate entity and is not added to CipherScan's `Organization.sameAs` list.

| Page | Proposed title | Proposed visible H1 | Proposed meta description |
| --- | --- | --- | --- |
| CipherSwap homepage | `Buy Zcash (ZEC) from BTC, ETH & More \| CipherSwap` | `Buy Zcash (ZEC) from Any Supported Chain` | `Buy ZEC by swapping BTC, ETH, SOL, stablecoins, and other supported assets into Zcash. Review the provider, rate, fees, and destination before you send.` |

CipherSwap's supported assets, payment providers, address support, fees, KYC,
custody, and failure handling belong in its own repository and legal review.
CipherScan's existing Terms and Privacy Policy still require a separate legal
decision because they describe retired on-site swap behavior.

## Ironwood copy and intent — approved

Use the existing migration tracker as the single authoritative Ironwood page.
It now lives at `/ironwood`; `/migration` redirects permanently. Navigation,
sitemap, breadcrumb, internal links, canonical, Open Graph metadata, and
structured data change in the same release. Do not create a separate
`/learn/ironwood` page competing for the same narrow query.

| Field | Approved copy |
| --- | --- |
| Title | `Zcash Ironwood Upgrade & Migration Tracker \| CipherScan` |
| Visible H1 | `Zcash Ironwood Upgrade & Migration Tracker` |
| Meta description | `Track the Zcash Ironwood (NU6.3) activation, Orchard migration, Ironwood shielded supply, and observable turnstile activity on CipherScan.` |

Approved visible introduction:

> Zcash Ironwood is the formally-verified shielded pool introduced by NU6.3.
> CipherScan tracks its activation, Orchard migration, verified shielded
> supply, anonymity cohorts, and trustless turnstile activity directly from
> the chain.

Recommended visible sections:

1. A concise answer to “What is Zcash Ironwood?” and the current activation
   state at block 3,428,143.
2. The existing live tracker, labelled precisely as observed chain data.
3. What NU6.3 changes and why Ironwood has a separate note commitment tree,
   nullifier set, value pool, and v6 transaction format.
4. What the Orchard-to-Ironwood turnstile exposes and what remains shielded.
5. Migration activity, pool balances, timing buckets, and privacy observations,
   with proxy metrics clearly distinguished from protocol guarantees.
6. Current wallet migration guidance based on the production plan implementers
   are shipping now.
7. Visible FAQs, primary sources, methodology, and a last-updated timestamp.

Owner direction: preserve the existing formal-verification, power-of-ten
migration, anonymity-cohort, `BALANCED`, verified-supply, and cryptographic
validity claims. The proof is not public yet, but the claims are approved as
true and should not be qualified. Wallets are implementing the migration plan
now; ZIP 318 reaches finalized status after production use rather than before
implementation. Preserve old newsletter activation targets as dated history.

## Main page copy proposals

| Page | Proposed title | Proposed visible H1 | Proposed meta description |
| --- | --- | --- | --- |
| Mainnet homepage | `CipherScan: Zcash Block Explorer & Privacy Analytics` | `CipherScan: Zcash Block Explorer` | `CipherScan is a Zcash block explorer for searching blocks, transactions, and addresses, with live shielded pool, privacy, and network analytics.` |
| Testnet homepage | `Zcash Testnet Explorer (TAZ) \| CipherScan` | `CipherScan: Zcash Testnet Explorer (TAZ)` | `Explore the Zcash testnet with CipherScan. Search TAZ blocks, transactions, and addresses, monitor the mempool, and test tools before mainnet.` |
| Mempool | `Zcash Mempool: Pending Transactions \| CipherScan` | `Zcash Mempool — Pending Transactions` | `Watch pending and unconfirmed Zcash transactions in real time, including transaction size, fee rate, and confirmation status.` |
| Learn | `Learn Zcash: Privacy & Shielded Transactions \| CipherScan` | Keep the existing visible H1 | `Learn how Zcash protects transaction privacy, how shielded addresses and pools work, and how to use ZEC safely with practical guides.` |
| Memo decryptor | `Decrypt Zcash Transaction Memos \| CipherScan` | Keep the existing visible H1 | `Decrypt Sapling and Orchard transaction memos in your browser using a Zcash viewing key. Your key never leaves your device.` |
| Privacy dashboard | `Zcash Privacy Dashboard & Shielded Pools \| CipherScan` | `Zcash Privacy Metrics` | `Track Zcash privacy with live Orchard, Sapling, and Ironwood pool sizes, shielded transaction activity, and CipherScan privacy metrics.` |
| Privacy risks | `Zcash Privacy Risk Analysis \| CipherScan` | `Zcash Privacy Risk Analysis` | `Find Zcash transactions with timing, amount, deshielding, or batch patterns that may reduce privacy. Explore risk signals on CipherScan.` |
| Shielded pools | `Zcash Shielded Pools \| CipherScan` | `Zcash Shielded Pools` | `Compare ZEC held in the Orchard, Sapling, and Ironwood shielded pools. Track migrations, pool shares, and privacy adoption over time.` |
| Mining | `Zcash Mining Stats & Pool Distribution \| CipherScan` | `Zcash Mining` | `Track Zcash hashrate, difficulty, block rewards, mining pool distribution, and miner behavior with live network data.` |

### Description-only proposals

| Page | Proposed meta description |
| --- | --- |
| Network | `Track Zcash network health with live node locations, hashrate, difficulty, peer counts, and blockchain statistics.` |
| API docs | `Use CipherScan's free Zcash API to query blocks, transactions, addresses, shielded pools, privacy analytics, and testnet data.` |
| Transaction broadcast | `Broadcast a fully signed raw Zcash transaction through CipherScan's Zebra node. No private key is required or submitted.` |
| Privacy policy | `Read how CipherScan handles analytics, logs, local browser data, and public Zcash blockchain information while protecting visitor privacy.` |
| Terms | `Review the terms for using CipherScan's Zcash explorer, APIs, privacy tools, and blockchain data, including availability and liability limits.` |

## Dynamic page copy proposals

### Blocks

- Canonical block title: `Zcash Block #<height> | CipherScan`.
- Canonical block H1: `Zcash Block #<height>`.
- Orphan title: `Orphaned Zcash Block #<height> | CipherScan`.
- Orphan H1: `Orphaned Zcash Block #<height>`.
- Include the complete block hash, mined time, transaction count, size, miner/pool, canonical/orphan status, and replacement block link in server-rendered content.
- Example description: `Zcash block #<height>, mined <date>, contains <count> transactions and is <canonical/orphaned>. View its full hash and block data on CipherScan.`

### Transactions

- Pending title: `Pending Zcash Transaction <short txid> | CipherScan`.
- Confirmed title: `Zcash Transaction <short txid> | CipherScan`.
- Pending H1: `Pending Zcash Transaction <full txid>`.
- Confirmed H1: `Zcash Transaction <full txid>`.
- The visible status and description should change from pending to confirmed without changing the transaction URL.
- Include type, block/confirmation status, shielded component counts, and the complete txid in server-rendered content and structured data.

### Addresses

- Title: `<type> Zcash Address <short address> | CipherScan`.
- H1: `Zcash Address <full address>`.
- For transparent addresses, describe balance and transaction count. For shielded addresses, state accurately that balance and transaction history are encrypted rather than presenting empty public values.

### Zcash Names

- Registered title: `<name> Zcash Name | CipherScan`.
- Registered H1: `<name> — Zcash Name`.
- Registered description: `<name> is a registered Zcash Name resolving to <short address>. View its status and registration history on CipherScan.`
- Available title: `<name> Is Available | Zcash Names | CipherScan`.
- Available H1: `<name> — Zcash Name Available`.
- Available description: `<name> is currently available as a Zcash Name. View claim pricing and registration details on CipherScan.`

### Crosslink pages

Crosslink remains `noindex, follow`, but these routes still need accurate titles, descriptions, H1s, canonicals, and social cards. Suggested social/search metadata:

- `/bootstrap`: `Zebra Crosslink Bootstrap | CipherScan`.
- `/chain`: `Crosslink Dual Chain Explorer | CipherScan`.
- `/finalizer/[pubkey]`: `<label or short key> Crosslink Finalizer | CipherScan`.
- `/fork-monitor`: `Crosslink Fork Monitor | CipherScan`.
- `/validators`: `Crosslink Finalizers & Stake | CipherScan`.

## Newsletter summary proposals

These replace only the frontmatter `summary` value after editorial approval.

| File | Proposed summary |
| --- | --- |
| `content/newsletter/weekly-2026-05-25.md` | `ZIP 2005 quantum recoverability merges, NU7-rc0 testnet launches with 25-second blocks, Bitstamp lists ZEC, and Noir enters private beta.` |
| `content/newsletter/weekly-2026-04-12.md` | `Cameron Winklevoss sparks a ZEC rally, ZODL faces Russian app-store removals, FlipZcash reaches Flipper Zero, and BTCPayServer seeks funding.` |
| `content/newsletter/weekly-2026-05-03.md` | `Zebra 4.4.0 fixes consensus vulnerabilities, ZCG funds bug bounties, new hardware-wallet projects emerge, and ZEC passes $398.` |
| `content/newsletter/weekly-2026-05-17.md` | `Grayscale files for a Zcash spot ETF, Zcash reaches the Wall Street Journal, NU7 polling begins, and new wallet and hardware projects ship.` |
| `content/newsletter/weekly-2026-07-05.md` | `Ironwood launches on Zcash testnet, ZCG seats new members, KeepKey seeks Orchard support funding, and CipherScan ships Ironwood integration.` |
| `content/newsletter/weekly-2026-05-31.md` | `Zebra patches 12 vulnerabilities, three Zcash wallets ship major features, and ZCG closes its bounty program after low-quality reports surge.` |
| `content/newsletter/weekly-2026-03-22.md` | `Foundry announces a ZEC mining pool, Zodl launches CrossPay, shielded ZEC reaches 30%, hashrate hits a record, and coinholder voting opens.` |
| `content/newsletter/weekly-2026-04-05.md` | `Crosslink feature nets launch April 15, Zcash's post-quantum roadmap gains attention, ViaBTC loses its majority, and Sapling deprecation advances.` |
| `content/newsletter/weekly-2026-04-19.md` | `Crosslink Season 1 launches, ZODL hires for R&D, Arthur Hayes backs ZEC, 25-second blocks gain support, and Zebra 4.3.1 fixes vulnerabilities.` |
| `content/newsletter/weekly-2026-03-29.md` | `Grayscale publishes new Zcash research, Zebra 4.3.0 patches critical issues and adds ZIP-235, and CipherPay launches payments for AI agents.` |
| `content/newsletter/weekly-2026-05-10.md` | `Quantum-recoverable wallets near release, Zcash Foundation takes stewardship of core assets, security updates ship, and ZEC crosses $590.` |

## Brand misspelling strategy

- Keep visible titles, headings, descriptions, and schema entity names consistently spelled `CipherScan`.
- Do not create thin pages for `cypherscan` or `zypherscan`, and do not insert those spellings repeatedly into visible copy.
- Do not rely on the meta-keywords field; major search engines do not use it as a ranking signal.
- If the typo domains are available and appropriate to acquire, permanently redirect them to `https://cipherscan.app/`. This is the cleanest way to capture direct typo navigation and consolidate signals.
- Keep the `WebSite` and `Organization` structured data, canonical host, social profiles, publisher name, and backlink anchors consistent so search engines can learn the correct brand entity and autocorrect close variants.
- Add misspellings to internal search/analytics normalization only if useful for users; that does not require publishing typo-targeted copy.

## Link decisions

### Resolved without changing the historical claim

| Source | Resolution |
| --- | --- |
| `content/newsletter/weekly-2026-03-29.md:104` | Corrected the official GitHub tag from the nonexistent `v3.0.1` slug to `zingolib_v3.0.1`. Newer releases exist, but the historical issue should keep linking to the version it reported. |
| `app/learn/page.tsx:797` | Replaced the retired GitHub-team page for the Zcash organization’s `crate-publishers` team with the official `zcash/librustzcash` repository and clarified the label to `Zcash Rust Crates`. |

### Confirmed 404s — editorial choice required

| Source | Missing target | Decision needed |
| --- | --- | --- |
| `content/newsletter/weekly-2026-05-25.md:27` | `https://nu7.valargroup.dev/` | The current Valar links cover Ironwood/Zakura, not the expired NU7-rc0 network. Recommended edit: link the [NU7-rc0 launch/forum thread](https://forum.zcashcommunity.com/t/55783) and say the temporary infrastructure has since been retired. For current testnet operations, Valar’s [Ironwood snapshots](https://ironwood.zakura.valargroup.dev) are most useful to node operators and its [status page](https://status.testnet.zakura.valargroup.dev) is the best health reference. |
| `content/newsletter/weekly-2026-04-19.md:14` | `https://electriccoin.co/blog/crosslink/` | No Google, Wayback, or Common Crawl copy was found. Recommended edit: change the anchor to `original trailing-finality proposal that became Crosslink` and link ECC’s live [Trailing Finality Layer article](https://electriccoin.co/blog/the-trailing-finality-layer-a-stepping-stone-to-proof-of-stake-in-zcash/). If the visible wording must remain `original Crosslink proposal`, use the [technical Crosslink design book](https://electric-coin-company.github.io/tfl-book/design/crosslink.html). |

### Crawler-blocked URLs — verify, do not automatically replace

| Source | Target | Review |
| --- | --- | --- |
| `app/learn/page.tsx:550` | `https://www.npmjs.com/package/zcashname-sdk` | Ahrefs received 403. Keep if a normal browser can open the canonical package page. |
| `app/learn/page.tsx:795` | `https://zcash.readthedocs.io/` | Replaced with the live Protocol Documentation page so the target matches the label and bypasses the root redirect. |
| `content/newsletter/weekly-2026-03-22.md:116` | `https://codez.ombie.cash/explore/repos` | Verified live with a server-rendered Zcash repository list. Keep; Ahrefs' 403 was crawler filtering rather than a dead page. |

## Approval questions

1. Approve or revise the homepage and testnet title/H1/description sets.
2. Approve the visible H1 changes for Mempool, Privacy, Privacy Risks, Pools, and Mining.
3. Approve the dynamic block, transaction, address, and Zcash Name templates.
4. Approve the 11 shortened newsletter summaries individually or as a batch.
5. Choose the Valar historical-link wording and the ECC Crosslink replacement;
   the other two external 404s are resolved above.
6. Confirm whether typo domains exist or should be acquired; otherwise proceed with entity consistency and no visible typo copy.
