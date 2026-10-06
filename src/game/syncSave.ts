import { defaultSave, normaliseSave, type Saved } from './save';

/** What follows the account. Settings, the dismissed prompt, the how-to card, the hint counter and the count of bought Gems already claimed (purchases belong to the phone that made them) stay on each phone. */
export type SyncedSave = Omit<Saved, 'settings' | 'accountPromptDismissed' | 'onboarded' | 'itemHints' | 'gemsClaimed' | 'coinsClaimed'>;

export const SYNCED_KEYS = [
  'coins', 'best', 'races', 'vehicle', 'unlocked', 'upgrades', 'paint', 'premium', 'ownedPaints',
  'adViews', 'driver', 'track', 'campaign', 'roomEarned',
] as const satisfies readonly (keyof SyncedSave)[];

export function pickSynced(s: Saved): SyncedSave {
  const out: Record<string, unknown> = {};
  for (const k of SYNCED_KEYS) out[k] = s[k];
  return out as SyncedSave;
}

/** Clean up whatever the network handed us: the same rules as a local save, synced fields only. */
export function normaliseSynced(raw: unknown): SyncedSave {
  const obj = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return pickSynced(normaliseSave(obj));
}

/** The remote synced fields over the local save; this phone's own settings are kept. */
export function mergeRemote(local: Saved, remote: SyncedSave): Saved {
  return { ...local, ...remote };
}

/** Anything beyond a brand-new save counts: races, naira, gems, but also paints bought, upgrades, stars, picks. */
export function hasProgress(s: Saved | SyncedSave): boolean {
  return JSON.stringify(pickSynced(s as Saved)) !== JSON.stringify(pickSynced(defaultSave()));
}

/**
 * On sign-in: the account wins when it has real progress. An account with no save, or an empty
 * one, takes this phone's progress instead, so a brand-new phone cannot wipe a played one.
 */
export function decideSignIn(local: Saved, remote: SyncedSave | null): 'upload' | 'download' | 'none' {
  if (remote && hasProgress(remote)) return 'download';
  return hasProgress(local) ? 'upload' : 'none';
}
