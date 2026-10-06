import { Show, SignInButton, useAuth } from '@clerk/react';
import { useEffect, useRef, useState } from 'react';
import { GEM_PACKS, PREMIUM_LABEL } from '../config/premium';
import { formatNaira } from '../config/economy';
import { createPayments } from '../game/payments';
import { AUTH_ENABLED } from './AuthControls';
import { claimPurchases } from './purchases';

function Packs() {
  const { getToken } = useAuth();
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A payment confirmed by the webhook after the player left checkout shows up when they open the shop.
  useEffect(() => { void claimPurchases(() => tokenRef.current()); }, []);
  const buy = async (pack: string) => {
    setBusy(true);
    setError('');
    const url = await createPayments({ getToken: () => tokenRef.current(), fetch: (...a) => fetch(...a) }).checkout(pack);
    if (url) return void location.assign(url);
    setBusy(false);
    setError('Could not start checkout. Check your connection and try again.');
  };
  return (
    <>
      {GEM_PACKS.map(p => (
        <button key={p.id} className="btn primary" disabled={busy} onClick={() => buy(p.id)}>
          {busy ? 'Opening checkout…' : `Buy ${p.gems} ${PREMIUM_LABEL} for ${formatNaira(p.naira)}`}
        </button>
      ))}
      {error && <p className="muted" role="alert">{error}</p>}
    </>
  );
}

/** The real-money part of the Get Gems dialog. Buying needs an account, so the purchase has an owner. */
export function BuyGems() {
  if (!AUTH_ENABLED) return null;
  return (
    <>
      <Show when="signed-in"><Packs /></Show>
      <Show when="signed-out">
        <SignInButton mode="modal"><button className="btn primary">Sign in to buy {PREMIUM_LABEL}</button></SignInButton>
      </Show>
    </>
  );
}
