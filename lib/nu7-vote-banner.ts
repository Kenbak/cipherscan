import { NU7_VOTE } from './nu7-vote-config';

// Five-day announcement window; a separate dismissal key resurfaces the results
// even for people who dismissed the earlier voting announcement.
export const NU7_RESULTS_ANNOUNCEMENT = {
  startsAt: '2026-09-14T22:15:00Z',
  endsAt: '2026-09-19T22:15:00Z',
} as const;
export type VoteBannerPhase = 'pre-snapshot' | 'pre-vote' | 'active' | 'results' | 'ended';
export function getVoteBannerPhase(now: number): VoteBannerPhase {
  if (now < Date.parse(NU7_VOTE.snapshotTime)) return 'pre-snapshot';
  if (now < Date.parse(NU7_VOTE.voteStartTime)) return 'pre-vote';
  if (now < Date.parse(NU7_VOTE.voteEndTime)) return 'active';
  if (now >= Date.parse(NU7_RESULTS_ANNOUNCEMENT.startsAt) && now < Date.parse(NU7_RESULTS_ANNOUNCEMENT.endsAt)) return 'results';
  return 'ended';
}
export function voteBannerDismissKey(phase: VoteBannerPhase) {
  return phase === 'results' ? 'nu7-results-banner-dismissed' : 'nu7-vote-banner-dismissed';
}
