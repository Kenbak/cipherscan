export const NU7_VOTE = {
  title: 'NU7 Coinholder Vote',
  snapshotTime: '2026-08-24T19:00:00Z',
  voteStartTime: '2026-08-25T00:00:00Z',
  voteEndTime: '2026-09-14T19:00:00Z',
  legitimacyThreshold: 1_000_000,
  forumUrl: 'https://forum.zcashcommunity.com/t/nu7-coinholder-vote/56912',
} as const;

export const VOTE_CHAIN = {
  primaryApi: 'https://prod.vote-chain-primary.valargroup.org',
  dynamicConfig: 'https://voting.valargroup.org/prod/dynamic-voting-config.json',
  explorer: 'https://prod.explorer.valargroup.org',
  endpoints: {
    activeRound: '/shielded-vote/v1/rounds/active',
    voteSummary: (roundId: string) => `/shielded-vote/v1/vote-summary/${roundId}`,
    tallyResults: (roundId: string) => `/shielded-vote/v1/tally-results/${roundId}`,
    ceremony: '/shielded-vote/v1/ceremony',
    voteManagers: '/shielded-vote/v1/vote-managers',
    validators: '/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=100',
  },
} as const;

export interface PollQuestion {
  id: string;
  title: string;
  description: string;
  options: string[];
  context?: string;
}

export const QUESTIONS: PollQuestion[] = [
  {
    id: 'q1-nsm-issuance',
    title: 'Q1 — NSM Issuance Smoothing',
    description:
      'The fee-burning component of the Network Sustainability Mechanism is already approved. The issuance smoothing component is unresolved. In no case will the total supply of ZEC be affected.',
    options: [
      'Smooth issuance curve. Replace halvings with a gradual issuance curve. NSM-recycled funds reissue along the same curve.',
      'Preserve halvings. Keep the existing halving schedule for newly minted ZEC. Fees and donated funds removed from circulation are eventually reissued into future block rewards.',
      'Do not include issuance smoothing in NU7. How unissued funds are reissued is left to future governance.',
      'Abstain.',
    ],
    context: 'halving',
  },
  {
    id: 'q2-nsm-reissuance',
    title: 'Q2 — NSM Reissuance Start Date',
    description:
      'NSM has prior coinholder approval. This question concerns the start of reissuance of funds removed from circulation (which includes at least 60% of total fees).',
    options: [
      'As soon as possible. If the outcome of Q1 is smoothed issuance, this will be February 2027; otherwise it may be sooner.',
      'February 2027, regardless of the outcome of Q1.',
      'February 2031, regardless of the outcome of Q1.',
      'Abstain.',
    ],
    context: 'halving',
  },
  {
    id: 'q3-sprout-deprecation',
    title: 'Q3 — Sprout Deprecation',
    description:
      'The Sprout pool was deprecated in 2018. Deposits are disabled, it holds less than 23,000 ZEC, and it accounts for under 0.1% of transaction volume. Disabling v4 transactions is now broadly accepted; only timing is open. The disposition of the affected funds is out of scope for this poll.',
    options: [
      'Immediately at NU7 activation.',
      'One year after this poll concludes.',
      'Do not set a date to disable v4 transactions.',
      'Abstain.',
    ],
    context: 'sprout',
  },
  {
    id: 'q4-faster-blocks',
    title: 'Q4 — Faster Block Times',
    description:
      'Should we reduce the block target spacing from 75s to 25s, and introduce per-pool action limits, per ZIP-218?',
    options: ['Yes.', 'No.', 'Abstain.'],
    context: 'blocktime',
  },
  {
    id: 'q5-nu7-scope',
    title: 'Q5 — NU7 Scope and Readiness',
    description:
      'NU7 will be consistent with the results of this poll, assuming each applicable feature is implemented by September 30th. NU7 will not include transaction format changes. The applicable features are the issuance approach selected in Q1 and Q2, disabling v4 transactions (Q3), and faster block times (Q4).',
    options: [
      'Ship NU7 as soon as possible, removing any feature that is not implemented by the September 30th deadline.',
      'Delay NU7 until every applicable feature approved in this poll is deemed complete.',
      'I do not support this NU7 plan.',
      'Abstain.',
    ],
  },
];

export interface WalletSupport {
  name: string;
  status: 'confirmed' | 'expected' | 'unknown';
  url?: string;
}

export const WALLETS: WalletSupport[] = [
  { name: 'Vizor', status: 'confirmed', url: 'https://vizor.vote' },
  { name: 'Zodl', status: 'confirmed', url: 'https://zodl.com' },
  { name: 'Cake Wallet', status: 'unknown', url: 'https://cakewallet.com' },
];

export const RESOURCES = [
  { label: 'Forum announcement', url: NU7_VOTE.forumUrl },
  { label: 'Run a validator', url: 'https://setup.valargroup.org' },
  { label: 'Verify a tally', url: 'https://tally.valargroup.org' },
  { label: 'Vote SDK (source)', url: 'https://github.com/valargroup/vote-sdk' },
  { label: 'PIR server setup', url: 'https://setup-pir.valargroup.org' },
  { label: 'Voting circuits', url: 'https://github.com/valargroup/voting-circuits' },
  { label: 'Client library', url: 'https://github.com/valargroup/zcash_voting' },
  { label: 'ZIP 218 (25s blocks)', url: 'https://zips.z.cash/zip-0218' },
  { label: 'ZIP 233 (NSM burn)', url: 'https://zips.z.cash/zip-0233' },
  { label: 'ZIP 234 (issuance smoothing)', url: 'https://zips.z.cash/zip-0234' },
];
