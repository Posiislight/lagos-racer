const KEY = 'lagos-racer:device-id';

const make = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Old browsers without randomUUID: still a v4-shaped id.
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
};

/**
 * The random id this phone buys Gems under, made once and kept. There are no accounts yet, so it is how the
 * server knows whose purchase is whose. Clearing site data loses it (and the purchases tied to it).
 */
export function deviceId(storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): string {
  try {
    const saved = storage?.getItem(KEY);
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
    const fresh = make();
    storage?.setItem(KEY, fresh);
    return fresh;
  } catch { return make(); }
}
