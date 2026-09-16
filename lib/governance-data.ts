import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { fetchWithDeadline } from './server-fetch';
import { GOVERNANCE_API, TRUSTED_ENDORSER, selectTrustedRounds, parseRoundVote, roundHex, type Catalog, type Round } from './governance';

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetchWithDeadline(`${GOVERNANCE_API}/${path}`, { cache: 'no-store' }, 8000);
  if (!response.ok) throw new Error('Voting API unavailable');
  return response.json();
}

const getPublishedVote = unstable_cache(async (round: Round) => {
  const id = roundHex(round.vote_round_id);
  const [summary, tally] = await Promise.all([fetchJson(`vote-summary/${id}`), fetchJson(`tally-results/${id}`)]);
  const vote = parseRoundVote(round, summary, tally, Date.now());
  if (vote.state !== 'results') throw new Error('Incomplete finalized tally');
  return vote;
}, ['governance-published-vote-v1'], { revalidate: 300 });

const refreshCatalog = unstable_cache(async (): Promise<Catalog> => {
  const [directory, registry, endorsements] = await Promise.all([
    fetchJson('rounds'), fetchJson('endorsers'), fetchJson(`endorsed-rounds/${TRUSTED_ENDORSER.id}`),
  ]);
  const rounds = selectTrustedRounds(directory, registry, endorsements);
  const votes: Catalog['votes'] = [];
  // Bounded batches; future directories must not fan out hundreds of requests at once.
  for (let i = 0; i < rounds.length; i += 4) {
    votes.push(...await Promise.all(rounds.slice(i, i + 4).map(async round => {
      if (round.status !== 3 || round.tally_timed_out) return parseRoundVote(round, null, null, Date.now());
      try { return await getPublishedVote(round); }
      catch { return parseRoundVote(round, null, null, Date.now()); }
    })));
  }
  return { votes: votes.sort((a, b) => b.round.vote_end_time - a.round.vote_end_time), checkedAt: Date.now(), unavailable: false };
}, ['governance-catalog-v1'], { revalidate: 60 });

// Throwing refreshes preserve Next's last successful cached catalog. The timestamp
// travels with the data so stale content is never described as a fresh API check.
export const getGovernanceCatalog = cache(async (): Promise<Catalog> => {
  try { return await refreshCatalog(); }
  catch { return { votes: [], checkedAt: 0, unavailable: true }; }
});
