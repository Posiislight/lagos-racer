import { useEffect, useState } from 'react';
import { GEM_PACKS, PREMIUM_LABEL, type GemPack } from '../config/premium';
import { formatNaira } from '../config/economy';
import { createPayments } from '../game/payments';
import { GemIcon } from './GemIcon';
import { claimPurchases } from './purchases';

const EMAIL_KEY = 'lagos-racer:pay-email';
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()) && s.length <= 120;
const savedEmail = () => { try { return localStorage.getItem(EMAIL_KEY) ?? ''; } catch { return ''; } };

/**
 * The real-money part of the Gems dialog. Tap a pack to pick it; only then does the email box appear,
 * because Paystack needs one for the receipt. No account needed: the purchase stays on this phone.
 */
export function BuyGems() {
  const [pack, setPack] = useState<GemPack | null>(null);
  const [email, setEmail] = useState(savedEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A payment confirmed by the webhook after the player left checkout shows up when they open the shop.
  useEffect(() => { void claimPurchases(); }, []);
  const pay = async (p: GemPack) => {
    if (!looksLikeEmail(email)) return setError('Enter a valid email so Paystack can send your receipt.');
    setBusy(true);
    setError('');
    try { localStorage.setItem(EMAIL_KEY, email.trim()); } catch { /* the email is just a convenience */ }
    const url = await createPayments({ fetch: (...a) => fetch(...a) }).checkout(p.id, email.trim());
    if (url) return void location.assign(url);
    setBusy(false);
    setError('Could not start checkout. Check your connection and try again.');
  };
  if (pack) {
    return (
      <form className="pay-step" onSubmit={e => { e.preventDefault(); void pay(pack); }}>
        <p className="pay-pick"><GemIcon /> <b>{pack.gems.toLocaleString()} {PREMIUM_LABEL}</b> for <b>{formatNaira(pack.naira)}</b></p>
        <label className="muted" htmlFor="pay-email">Email for your Paystack receipt</label>
        <input id="pay-email" className="pay-email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com"
          value={email} onChange={e => setEmail(e.target.value)} autoFocus />
        <div className="row">
          <button type="button" className="btn" disabled={busy} onClick={() => { setPack(null); setError(''); }}>Back</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Opening checkout…' : `Pay ${formatNaira(pack.naira)}`}</button>
        </div>
        {error && <p className="muted" role="alert">{error}</p>}
      </form>
    );
  }
  return (
    <div className="gem-packs">
      {GEM_PACKS.map(p => (
        <button key={p.id} className="gem-pack" aria-label={`${p.gems} ${PREMIUM_LABEL} for ${formatNaira(p.naira)}`} onClick={() => setPack(p)}>
          <GemIcon size="2em" />
          <b>{p.gems.toLocaleString()}</b>
          <span>{formatNaira(p.naira)}</span>
        </button>
      ))}
    </div>
  );
}
