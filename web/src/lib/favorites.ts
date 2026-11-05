// Favoris : stockés dans le navigateur (localStorage), synchronisés entre composants et onglets.
import { useCallback, useSyncExternalStore } from "react";

const KEY = "ah-favs";
let cache: string[] | null = null;
const subs = new Set<() => void>();

function read(): string[] {
  if (cache) return cache;
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); cache = Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; }
  catch { cache = []; }
  return cache!;
}
function write(ids: string[]) {
  cache = ids;
  try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* navigation privée : on garde en mémoire */ }
  subs.forEach((f) => f());
}
function subscribe(f: () => void) {
  subs.add(f);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; f(); } };
  addEventListener("storage", onStorage);
  return () => { subs.delete(f); removeEventListener("storage", onStorage); };
}

export function useFavorites() {
  const ids = useSyncExternalStore(subscribe, read, () => []);
  const toggle = useCallback((id: string) => { const c = read(); write(c.includes(id) ? c.filter((x) => x !== id) : [id, ...c]); }, []);
  const addMany = useCallback((more: string[]) => write([...new Set([...more, ...read()])]), []);
  const clear = useCallback(() => write([]), []);
  return { ids, has: (id: string) => ids.includes(id), toggle, addMany, clear };
}
