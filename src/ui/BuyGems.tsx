import { useEffect, useState } from 'react';
import { GEM_PACKS, PREMIUM_LABEL } from '../config/premium';
import { formatNaira } from '../config/economy';
import { createPayments } from '../game/payments';
import { claimPurchases } from './purchases';

const EMAIL_KEY = 'lagos-racer:pay-email';
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()) && s.length <= 120;
const savedEmail = () => { try { return localStorage.getItem(EMAIL_KEY) ?? ''; } catch { return ''; } };

/** The real-money part of the Get Gems dialog. No account needed: Paystack asks for an email, and the purchase stays on this phone. */
export function BuyGems() {
  const [email, setEmail] = useState(savedEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A payment confirmed by the webhook after the player left checkout shows up when they open the shop.
  useEffect(() => { void claimPurchases(); }, []);
  const buy = async (pack: string) => {
    if (!looksLikeEmail(email)) return setError('Enter a valid email so Paystack can send your receipt.');
    setBusy(true);
    setError('');
    try { localStorage.setItem(EMAIL_KEY, email.trim()); } catch { /* the email is just a convenience */ }
    const url = await createPayments({ fetch: (...a) => fetch(...a) }).checkout(pack, email.trim());
    if (url) return void location.assign(url);
    setBusy(false);
    setError('Could not start checkout. Check your connection and try again.');
  };
  return (
    <>
      <label className="muted" htmlFor="pay-email">Email for your Paystack receipt</label>
      <input id="pay-email" className="pay-email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com"
        value={email} onChange={e => setEmail(e.target.value)} />
      {GEM_PACKS.map(p => (
        <button key={p.id} className="btn primary" disabled={busy} onClick={() => buy(p.id)}>
          {busy ? 'Opening checkout…' : `Buy ${p.gems} ${PREMIUM_LABEL} for ${formatNaira(p.naira)}`}
        </button>
      ))}
      {error && <p className="muted" role="alert">{error}</p>}
    </>
  );
}
