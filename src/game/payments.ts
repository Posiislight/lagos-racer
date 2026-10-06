import { deviceId } from './deviceId';
import { syncBaseUrl } from './sync';

export type PaymentsDeps = {
  baseUrl?: string;
  /** The id this phone buys under. */
  buyer?: () => string;
  fetch: typeof fetch;
};

export type VerifyStatus = 'credited' | 'already' | 'pending' | 'failed' | 'invalid';

/** Talks to the room server's /pay routes as this phone's buyer id. Failures come back as null; nothing here throws. */
export function createPayments(deps: PaymentsDeps) {
  const base = deps.baseUrl ?? syncBaseUrl();
  const buyer = deps.buyer ?? (() => deviceId());

  async function call<T>(path: string, init: RequestInit = {}): Promise<T | null> {
    try {
      const res = await deps.fetch(`${base}${path}`, {
        ...init,
        headers: { 'X-Device-Id': buyer(), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      });
      return res.ok ? await res.json() as T : null;
    } catch { return null; }
  }

  return {
    /** Starts a Paystack checkout for a Gem pack: the page to send the player to, or null if it could not start. */
    async checkout(pack: string, email: string): Promise<string | null> {
      const r = await call<{ url?: string }>('/pay/init', { method: 'POST', body: JSON.stringify({ pack, email }) });
      return typeof r?.url === 'string' ? r.url : null;
    },
    /** Asks the server to confirm a payment the player has just made. */
    async verify(reference: string): Promise<{ status: VerifyStatus; total: number } | null> {
      return call(`/pay/verify?reference=${encodeURIComponent(reference)}`);
    },
    /** Every Gem this phone has ever bought, or null when it could not be fetched. */
    async total(): Promise<number | null> {
      const r = await call<{ total?: number }>('/pay/total');
      return typeof r?.total === 'number' ? r.total : null;
    },
  };
}

/** The Paystack reference in the page address after the player comes back from checkout, or null. */
export function referenceFromSearch(search: string): string | null {
  const q = new URLSearchParams(search);
  const ref = q.get('reference') ?? q.get('trxref');
  return ref && /^[\w-]{1,100}$/.test(ref) ? ref : null;
}

/** The address without the Paystack parameters, so a refresh does not verify the same payment again. */
export function withoutPaystackParams(href: string): string {
  const u = new URL(href);
  u.searchParams.delete('reference');
  u.searchParams.delete('trxref');
  return u.pathname + (u.search || '') + u.hash;
}
