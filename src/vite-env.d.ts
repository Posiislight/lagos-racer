/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Room server address, e.g. wss://rooms.example.com. Defaults to port 8787 on whatever host served the page. */
  readonly VITE_ROOM_SERVER?: string;
}
