/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Room server address, e.g. wss://rooms.example.com. Defaults to port 8787 on whatever host served the page. */
  readonly VITE_ROOM_SERVER?: string;
  /** AdSense publisher id (ca-pub-…). Turns on rewarded ads, as test ads unless VITE_ADS_LIVE is 1 in a production build. */
  readonly VITE_ADSENSE_CLIENT?: string;
  readonly VITE_ADS_LIVE?: string;
}
