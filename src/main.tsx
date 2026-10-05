import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { devAdStub, setAdProvider } from './game/ads';

// No real ad network yet: dev builds get a stub so the Garage ad flow can be tried.
if (import.meta.env.DEV) setAdProvider(devAdStub);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
