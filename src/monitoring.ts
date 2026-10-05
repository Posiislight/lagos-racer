import * as Sentry from '@sentry/react';

/** Sentry error reporting. Off unless VITE_SENTRY_DSN is set, so dev and forks send nothing. */
export const MONITORING_ENABLED = Boolean(import.meta.env.VITE_SENTRY_DSN);

export function initMonitoring() {
  if (!MONITORING_ENABLED) return;
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    // Errors only: no tracing and no session replay, to keep the bundle and CPU cost low on budget phones.
    tracesSampleRate: 0,
    // Noise that is not a bug in the game.
    ignoreErrors: [
      'ResizeObserver loop',
      'Non-Error promise rejection captured',
      /Failed to fetch|NetworkError|Load failed/,
    ],
  });
}

export { Sentry };
