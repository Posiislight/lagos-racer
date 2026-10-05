import { ClerkProvider } from '@clerk/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { devAdStub, setAdProvider } from './game/ads';
import { AUTH_ENABLED } from './ui/AuthControls';

// No real ad network yet: dev builds get a stub so the Garage ad flow can be tried.
if (import.meta.env.DEV) setAdProvider(devAdStub);

// Accounts are optional: with no Clerk key the game runs exactly as before.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {AUTH_ENABLED ? (
      <ClerkProvider afterSignOutUrl="/"><App /></ClerkProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
);
