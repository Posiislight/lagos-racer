import { useAuth } from '@clerk/react';
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { snapshot, onSaved, useGame } from '../game/store';
import { createSync, syncBaseUrl, type SyncStatus } from '../game/sync';
import { AUTH_ENABLED } from './AuthControls';
import { claimPurchases } from './purchases';

const useSyncStatus = create<{ status: SyncStatus; set: (s: SyncStatus) => void }>(set => ({ status: 'idle', set: status => set({ status }) }));

const LABEL: Record<SyncStatus, string> = { idle: '', syncing: 'Syncing…', saved: 'Saved to your account', offline: 'Offline, will retry' };

/** Keeps a signed-in player's progress in step with their account. Renders nothing. */
function Engine() {
  const { isSignedIn, userId, getToken } = useAuth();
  // Held in a ref so a new getToken identity does not restart the sync.
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  useEffect(() => {
    if (!isSignedIn || !userId) { useSyncStatus.getState().set('idle'); return; }
    const sync = createSync({
      baseUrl: syncBaseUrl(),
      userId,
      getToken: () => tokenRef.current(),
      fetch: (...a) => fetch(...a),
      getLocal: snapshot,
      applyRemote: remote => useGame.getState().applyRemoteSave(remote),
      onStatus: s => useSyncStatus.getState().set(s),
    });
    const offSaved = onSaved(sync.schedulePush);
    // A finished race is worth saving now, not in three seconds.
    const offResults = useGame.subscribe((s, prev) => { if (s.results && s.results !== prev.results) void sync.flush(); });
    // Closing the tab inside the debounce window must not lose the last change.
    const onHide = () => { if (document.hidden) void sync.flush(); };
    document.addEventListener('visibilitychange', onHide);
    // Once the account's save is in, add Gems bought on any device, and confirm a payment the player just came back from.
    void sync.start().then(async () => { if (await claimPurchases(() => tokenRef.current())) await sync.flush(); });
    return () => { document.removeEventListener('visibilitychange', onHide); offSaved(); offResults(); sync.stop(); };
  }, [isSignedIn, userId]);
  return null;
}

/** Mount once inside ClerkProvider. With no Clerk key it renders nothing at all. */
export function SyncManager() {
  return AUTH_ENABLED ? <Engine /> : null;
}

/** The small "Saved to your account" line for the menu. */
export function SyncChip() {
  const status = useSyncStatus(s => s.status);
  if (!AUTH_ENABLED || status === 'idle') return null;
  return <span className={`sync-chip ${status}`} role="status">{LABEL[status]}</span>;
}
