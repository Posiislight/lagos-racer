import { useEffect, useState, type ReactNode } from 'react';
import { GEM_PACKS, NAIRA_PACKS, PREMIUM_LABEL } from '../config/premium';
import { formatNaira } from '../config/economy';
import { createPayments } from '../game/payments';
import { GemIcon, NairaIcon } from './GemIcon';
import { claimPurchases } from './purchases';

const EMAIL_KEY = 'lagos-racer:pay-email';
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()) && s.length <= 120;
const savedEmail = () => { try { return localStorage.getItem(EMAIL_KEY) ?? ''; } catch { return ''; } };

/** 250000 -> "250K", 1000000 -> "1M", 100 -> "100". */
const compact = (n: number) => n >= 1_000_000 ? `${n / 1_000_000}M` : n >= 10_000 ? `${n / 1_000}K` : n.toLocaleString();

type Choice = { id: string; price: number; label: string; spoken: string; icon: (size: string) => ReactNode };

const CHOICES: Record<'gems' | 'naira', Choice[]> = {
  gems: GEM_PACKS.map(p => ({
    id: p.id, price: p.naira, label: compact(p.gems), spoken: `${p.gems} ${PREMIUM_LABEL}`, icon: size => <GemIcon size={size} />,
  })),
  naira: NAIRA_PACKS.map(p => ({
    id: p.id, price: p.naira, label: compact(p.coins), spoken: `${formatNaira(p.coins)} in-game naira`, icon: size => <NairaIcon size={size} />,
  })),
};

/**
 * The real-money part of a shop dialog. Tap a pack to pick it; only then does the email box appear,
 * because Paystack needs one for the receipt. No account needed: the purchase stays on this phone.
 */
export function BuyPacks({ kind }: { kind: 'gems' | 'naira' }) {
  const [pack, setPack] = useState<Choice | null>(null);
  const [email, setEmail] = useState(savedEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A payment confirmed by the webhook after the player left checkout shows up when they open the shop.
  useEffect(() => { void claimPurchases(); }, []);
  const pay = async (p: Choice) => {
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
        <p className="pay-pick">{pack.icon('1.1em')} <b>{pack.spoken}</b> for <b>{formatNaira(pack.price)}</b></p>
        <label className="muted" htmlFor="pay-email">Email for your Paystack receipt</label>
        <input id="pay-email" className="pay-email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com"
          value={email} onChange={e => setEmail(e.target.value)} autoFocus />
        <div className="row">
          <button type="button" className="btn" disabled={busy} onClick={() => { setPack(null); setError(''); }}>Back</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Opening checkout…' : `Pay ${formatNaira(pack.price)}`}</button>
        </div>
        {error && <p className="muted" role="alert">{error}</p>}
      </form>
    );
  }
  return (
    <div className="gem-packs">
      {CHOICES[kind].map(p => (
        <button key={p.id} className="gem-pack" aria-label={`${p.spoken} for ${formatNaira(p.price)}`} onClick={() => setPack(p)}>
          {p.icon('2em')}
          <b>{p.label}</b>
          <span>{formatNaira(p.price)}</span>
        </button>
      ))}
    </div>
  );
}
