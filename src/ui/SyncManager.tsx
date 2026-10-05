import { useAuth } from '@clerk/react';
import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { snapshot, onSaved, useGame } from '../game/store';
import { createSync, syncBaseUrl, type SyncStatus } from '../game/sync';
import { AUTH_ENABLED } from './AuthControls';

const useSyncStatus = create<{ status: SyncStatus; set: (s: SyncStatus) => void }>(set => ({ status: 'idle', set: status => set({ status }) }));

const LABEL: Record<SyncStatus, string> = { idle: '', syncing: 'Syncing…', saved: 'Saved to your account', offline: 'Offline, will retry' };

/** Keeps a signed-in player's progress in step with their account. Renders nothing. */
function Engine() {
  const { isSignedIn, getToken } = useAuth();
  // Held in a ref so a new getToken identity does not restart the sync.
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  useEffect(() => {
    if (!isSignedIn) { useSyncStatus.getState().set('idle'); return; }
    const sync = createSync({
      baseUrl: syncBaseUrl(),
      getToken: () => tokenRef.current(),
      fetch: (...a) => fetch(...a),
      getLocal: snapshot,
      applyRemote: remote => useGame.getState().applyRemoteSave(remote),
      onStatus: s => useSyncStatus.getState().set(s),
    });
    const offSaved = onSaved(sync.schedulePush);
    // A finished race is worth saving now, not in three seconds.
    const offResults = useGame.subscribe((s, prev) => { if (s.results && s.results !== prev.results) void sync.flush(); });
    void sync.start();
    return () => { offSaved(); offResults(); sync.stop(); };
  }, [isSignedIn]);
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
