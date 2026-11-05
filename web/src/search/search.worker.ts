/// <reference lib="webworker" />
// Web Worker : charge les shards (type prioritaire d'abord), construit l'index MiniSearch,
// puis répond aux requêtes (recherche floue pondérée + filtres + tri + facettes).
import MiniSearch from "minisearch";
import type { Facets, Item, ItemType, Manifest } from "../lib/types";
import type { FromWorker, ToWorker } from "./protocol";

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);
const strip = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const items: Item[] = [];
const indexOf = new Map<string, number>(); // id -> position globale
const mini = new MiniSearch<{ i: number; name: string; tags: string; summary: string; summary_en: string; repo: string }>({
  idField: "i",
  fields: ["name", "tags", "summary", "summary_en", "repo"],
  // Pondération demandée : nom > tags > description.
  searchOptions: {
    boost: { name: 6, tags: 3, summary: 1, summary_en: 0.5, repo: 0.8 },
    prefix: true,
    fuzzy: (term) => (term.length > 4 ? 0.2 : false),
  },
  processTerm: (t) => strip(t),
});

function addBatch(batch: Item[]) {
  const docs = [];
  for (const it of batch) {
    if (indexOf.has(it.id)) continue;
    const i = items.length; items.push(it); indexOf.set(it.id, i);
    docs.push({ i, name: it.name.replace(/[-_]/g, " ") + " " + it.name, tags: it.tags.join(" "), summary: it.summary, summary_en: it.summary_en, repo: it.source.repo });
  }
  mini.addAll(docs);
}

let loadedAll = false;
async function load(baseUrl: string, priority: ItemType) {
  try {
    const manifest: Manifest = await (await fetch(`${baseUrl}index/manifest.json`)).json();
    post({ kind: "manifest", manifest });
    const shards = [...manifest.shards].sort((a, b) => Number(b.type === priority) - Number(a.type === priority));
    let loaded = 0;
    for (const s of shards) {
      const res = await fetch(`${baseUrl}index/${s.file}`);
      if (!res.ok) throw new Error(`${s.file}: HTTP ${res.status}`);
      const batch: Item[] = await res.json();
      addBatch(batch);
      loaded += batch.length;
      post({ kind: "items", items: batch, loaded, total: manifest.total });
    }
    loadedAll = true; post({ kind: "done" });
  } catch (e) {
    post({ kind: "error", message: e instanceof Error ? e.message : String(e) });
  }
}

const DAY = 86400000;
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const top = (m: Map<string, number>, n: number): [string, number][] =>
  [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  if (msg.kind === "init") { void load(msg.baseUrl, msg.priority); return; }

  const { q, type, filters, sort, reqId, limit } = msg;
  const query = q.trim();
  let terms: string[] = [];
  let candidates: { i: number; score: number }[];

  if (query) {
    let res = mini.search(query, { combineWith: "AND" });
    if (res.length === 0) res = mini.search(query, { combineWith: "OR" }); // repli : tolérant
    terms = [...new Set(res.slice(0, 50).flatMap((r) => r.terms))];
    candidates = res.map((r) => ({ i: r.id as number, score: r.score }));
  } else {
    candidates = items.map((_, i) => ({ i, score: 0 }));
  }

  // 1) onglet + requête → base des facettes et compteurs d'onglets
  const counts: Record<ItemType, number> = { skill: 0, hook: 0, mod: 0 };
  const inTab: { i: number; score: number }[] = [];
  for (const c of candidates) {
    const it = items[c.i];
    counts[it.type]++;
    if (type === "all" || it.type === type) inTab.push(c);
  }

  // 2) facettes (sur onglet + requête, avant filtres, pour permettre d'élargir la sélection)
  const fa = new Map<string, number>(), ft = new Map<string, number>(), fl = new Map<string, number>(), fr = new Map<string, number>();
  for (const c of inTab) {
    const it = items[c.i];
    it.agents.forEach((a) => bump(fa, a)); it.tags.forEach((t) => bump(ft, t));
    bump(fl, it.license ?? "Aucune"); bump(fr, it.risk.level);
  }
  const facets: Facets = { agents: top(fa, 12), tags: top(ft, 30), licenses: top(fl, 12), risks: top(fr, 4) };

  // 3) filtres
  const now = Date.now();
  const f = filters;
  const out = inTab.filter(({ i }) => {
    const it = items[i];
    if (f.agents.length && !f.agents.some((a) => it.agents.includes(a))) return false;
    if (f.tags.length && !f.tags.every((t) => it.tags.includes(t))) return false;
    if (f.licenses.length && !f.licenses.includes(it.license ?? "Aucune")) return false;
    if (f.risks.length && !f.risks.includes(it.risk.level)) return false;
    if (f.minStars && it.stars < f.minStars) return false;
    if (f.activityDays && now - Date.parse(it.lastCommit) > f.activityDays * DAY) return false;
    return true;
  });

  // 4) tri
  const byStars = (a: { i: number }, b: { i: number }) => items[b.i].stars - items[a.i].stars;
  if (sort === "stars" || (sort === "relevance" && !query)) out.sort(byStars);
  else if (sort === "recent") out.sort((a, b) => Date.parse(items[b.i].lastCommit) - Date.parse(items[a.i].lastCommit));
  else if (sort === "new") out.sort((a, b) => Date.parse(items[b.i].firstSeen) - Date.parse(items[a.i].firstSeen));
  else out.sort((a, b) => b.score - a.score || byStars(a, b));

  const slice = limit ? out.slice(0, limit) : out;
  const indices = Uint32Array.from(slice, (c) => c.i);
  post({ kind: "result", reqId, indices, total: out.length, terms, facets, counts }, [indices.buffer]);
  void loadedAll;
};
