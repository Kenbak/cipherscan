import type { ZNS } from 'zcashname-sdk';

export type NameRegistration = NonNullable<Awaited<ReturnType<ZNS['resolveName']>>>;
export type NameEvent = Awaited<ReturnType<ZNS['events']>>['events'][number];
export type NamePricing = NonNullable<Awaited<ReturnType<ZNS['status']>>['pricing']>;
export type NameResolution =
  | { state: 'registered'; registration: NameRegistration }
  | { state: 'available' }
  | { state: 'error' };
export type NameSnapshot =
  | { state: 'registered'; registration: NameRegistration; events: NameEvent[] | null }
  | { state: 'available'; pricing: NamePricing | null }
  | { state: 'error' };
