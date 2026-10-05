import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { devAdStub, setAdProvider } from './game/ads';
import { createGoogleAdProvider } from './game/googleAds';

// Rewarded ads come from Google H5 Games Ads when VITE_ADSENSE_CLIENT is set. They are placeholder
// test ads everywhere except a production build with VITE_ADS_LIVE=1. With no id, dev builds get a stub.
const adClient = import.meta.env.VITE_ADSENSE_CLIENT;
if (adClient) {
  const live = import.meta.env.PROD && import.meta.env.VITE_ADS_LIVE === '1';
  setAdProvider(createGoogleAdProvider({ client: adClient, testMode: !live }));
} else if (import.meta.env.DEV) setAdProvider(devAdStub);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
