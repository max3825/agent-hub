import { useCallback, useEffect, useRef, useState } from "react";
import type { Facets, Filters, Item, ItemType, Manifest, SortKey } from "../lib/types";
import type { FromWorker, ToWorker } from "./protocol";

export interface SearchResult {
  items: Item[]; total: number; terms: string[]; facets: Facets;
  counts: Record<ItemType, number>; pending: boolean;
}
const emptyFacets: Facets = { agents: [], tags: [], licenses: [], risks: [] };

/** Un seul worker partagé. Les items vivent côté main (même ordre que dans le worker). */
export function useSearchEngine(priority: ItemType) {
  const workerRef = useRef<Worker>();
  const itemsRef = useRef<Item[]>([]);
  const waiters = useRef(new Map<number, (r: Extract<FromWorker, { kind: "result" }>) => void>());
  const reqId = useRef(0);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // incrémenté quand de nouveaux items arrivent
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    itemsRef.current = []; setLoaded(0); setDone(false); setError(null); setManifest(null);
    const w = new Worker(new URL("./search.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    w.onmessage = (ev: MessageEvent<FromWorker>) => {
      const m = ev.data;
      if (m.kind === "manifest") setManifest(m.manifest);
      else if (m.kind === "items") {
        for (const it of m.items) itemsRef.current.push(it);
        setLoaded(m.loaded); setVersion((v) => v + 1);
      } else if (m.kind === "done") setDone(true);
      else if (m.kind === "error") setError(m.message);
      else if (m.kind === "result") { waiters.current.get(m.reqId)?.(m); waiters.current.delete(m.reqId); }
    };
    const init: ToWorker = { kind: "init", baseUrl: new URL(import.meta.env.BASE_URL, document.baseURI).href, priority };
    w.postMessage(init);
    return () => w.terminate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const run = useCallback((q: string, type: ItemType | "all", filters: Filters, sort: SortKey, limit?: number) =>
    new Promise<Extract<FromWorker, { kind: "result" }>>((resolve) => {
      const id = ++reqId.current;
      waiters.current.set(id, resolve);
      const msg: ToWorker = { kind: "query", reqId: id, q, type, filters, sort, limit };
      workerRef.current?.postMessage(msg);
    }), []);

  return { manifest, loaded, done, error, version, run, itemsRef, retry: () => setAttempt((a) => a + 1) };
}

export type Engine = ReturnType<typeof useSearchEngine>;

/** Requête principale (liste). Débouncée légèrement ; ignore les réponses périmées. */
export function useQuery(engine: Engine, q: string, type: ItemType, filters: Filters, sort: SortKey) {
  const [res, setRes] = useState<SearchResult>({ items: [], total: 0, terms: [], facets: emptyFacets, counts: { skill: 0, hook: 0, mod: 0 }, pending: true });
  const latest = useRef(0);
  const key = JSON.stringify([q, type, filters, sort]);
  useEffect(() => {
    if (engine.loaded === 0 && !engine.done) return;
    const my = ++latest.current;
    const t = setTimeout(() => {
      setRes((r) => ({ ...r, pending: true }));
      engine.run(q, type, filters, sort).then((r) => {
        if (my !== latest.current) return;
        const items = Array.from(r.indices, (i) => engine.itemsRef.current[i]).filter(Boolean);
        setRes({ items, total: r.total, terms: r.terms, facets: r.facets, counts: r.counts, pending: false });
      });
    }, q ? 90 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, engine.version, engine.done]);
  return res;
}
