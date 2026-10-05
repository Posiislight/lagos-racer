// Where the room server lives. It is a public address, not a secret.
export const PRODUCTION_ROOM_SERVER = 'wss://lagos-racer-server.onrender.com';

/**
 * VITE_ROOM_SERVER when it is a usable ws(s) address, else the hosted server in production builds,
 * else port 8787 on the page's own host so phones on the same Wi-Fi reach a laptop's server in dev.
 * A missing or mistyped variable on Vercel therefore cannot leave the deployed game pointing nowhere.
 */
export function roomServerUrl(
  env: string | undefined = import.meta.env.VITE_ROOM_SERVER,
  prod: boolean = import.meta.env.PROD,
  hostname: string = location.hostname,
): string {
  const cleaned = env?.trim().replace(/\/+$/, '');
  if (cleaned && /^wss?:\/\/[^\s/]+$/.test(cleaned)) return cleaned;
  return prod ? PRODUCTION_ROOM_SERVER : `ws://${hostname}:8787`;
}
