import { create } from 'zustand';
import { useGame } from '../game/store';
import { createPayments, referenceFromSearch, withoutPaystackParams } from '../game/payments';
import { PREMIUM_LABEL } from '../config/premium';

/** A one-line result of a purchase, shown on the menu until the player moves on. */
export const usePayNote = create<{ note: string; set: (note: string) => void }>(set => ({ note: '', set: note => set({ note }) }));

/**
 * Brings this phone up to date with the Gems it has bought: confirms a payment the player just came back
 * from (the reference in the address), then adds whatever the server says this phone has bought that it
 * has not had yet. Safe to call as often as you like. Returns the Gems added.
 */
export async function claimPurchases(): Promise<number> {
  const pay = createPayments({ fetch: (...a) => fetch(...a) });
  const reference = referenceFromSearch(location.search);
  const outcome = reference ? await pay.verify(reference) : null;
  // Only drop the reference once the server has seen it, so an offline return can try again.
  if (reference && outcome) history.replaceState(null, '', withoutPaystackParams(location.href));
  const total = outcome?.total ?? await pay.total();
  const added = total === null ? 0 : useGame.getState().claimPurchasedGems(total);
  const { set } = usePayNote.getState();
  if (added > 0) set(`+${added} ${PREMIUM_LABEL} added. Thank you!`);
  else if (outcome?.status === 'pending') set('Your payment is still processing. Your Gems will arrive in a moment.');
  else if (outcome?.status === 'failed') set('That payment did not go through, so nothing was charged.');
  return added;
}
