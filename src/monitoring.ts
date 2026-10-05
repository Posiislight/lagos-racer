import * as Sentry from '@sentry/react';

// A browser DSN is public by design (it only allows sending events), so it lives in the source.
const DSN = import.meta.env.VITE_SENTRY_DSN ?? 'https://f1cd08b0e149c6423821fdb8e064dd37@o4509816762138624.ingest.us.sentry.io/4512205368393728';

/** Sentry error reporting. Production builds only, so local dev sends nothing. */
export const MONITORING_ENABLED = import.meta.env.PROD && Boolean(DSN);

export function initMonitoring() {
  if (!MONITORING_ENABLED) return;
  Sentry.init({
    dsn: DSN,
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
