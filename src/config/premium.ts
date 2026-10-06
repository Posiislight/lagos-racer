/**
 * Premium currency settings. The name is Gems; the prices are placeholders until decided
 * (see docs/superpowers/specs/2026-10-05-premium-currency-design.md). The BRT is bought with naira; its price and ad count
 * are in `locked` in vehicles.ts.
 */
export const PREMIUM_LABEL = 'Gems';

/** What every non-default paint costs, in premium currency. */
export const PAINT_PRICE = 100;

/** Gems a player gets for watching one rewarded ad to the end. */
export const AD_GEMS = 5;

/** A Gem pack bought with real naira through Paystack. The server prices from this table, never from the request. */
export type GemPack = { id: string; gems: number; naira: number };
export const GEM_PACKS: GemPack[] = [
  { id: 'gems-100', gems: 100, naira: 500 },
  { id: 'gems-500', gems: 500, naira: 2_500 },
  { id: 'gems-1000', gems: 1_000, naira: 5_000 },
];
export const gemPackById = (id: unknown): GemPack | undefined => GEM_PACKS.find(p => p.id === id);
