/// <reference lib="webworker" />
// Web Worker : charge les shards (type prioritaire d'abord), construit l'index MiniSearch, charge ensuite
// (en différé) le modèle sémantique LSA, puis répond aux requêtes :
//   recherche floue pondérée (+ mélange sémantique), filtres, tri, facettes, éléments similaires.
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

// ── Modèle sémantique (LSA) : format décrit dans crawler/semantic.py ───────────────────────────
interface Sem { k: number; scale: number; vocab: Map<string, number>; idf: number[]; U: Int8Array; row: Map<string, number>; vecs: Int8Array }
let sem: Sem | null = null;
const STOP = new Set("the and for with from your you are this that into over per via les des pour avec dans une sur par est aux ces son ses qui que not can all any use used using".split(" "));
const tokenize = (t: string) => (strip(t).match(/[a-z0-9]{2,}/g) ?? []).filter((w) => !STOP.has(w)); // identique à semantic.py
const b64 = (s: string) => { const bin = atob(s); const a = new Int8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i) << 24 >> 24; return a; };

async function loadSemantic(baseUrl: string) {
  try {
    const res = await fetch(`${baseUrl}index/semantic.json`);
    if (!res.ok) return;
    const m = await res.json();
    sem = {
      k: m.k, scale: m.scale, idf: m.idf, vocab: new Map<string, number>(m.vocab.map((t: string, i: number) => [t, i])),
      U: b64(m.U), vecs: b64(m.vecs), row: new Map<string, number>(m.ids.map((id: string, i: number) => [id, i])),
    };
    post({ kind: "semantic", ready: true });
  } catch { /* la recherche sémantique est optionnelle */ }
}

function encode(text: string): Float32Array | null {
  if (!sem) return null;
  const counts = new Map<number, number>();
  for (const t of tokenize(text)) { const j = sem.vocab.get(t); if (j !== undefined) counts.set(j, (counts.get(j) ?? 0) + 1); }
  if (!counts.size) return null;
  const q = new Float32Array(sem.k);
  for (const [j, c] of counts) { const w = (1 + Math.log(c)) * sem.idf[j] * sem.scale; for (let d = 0; d < sem.k; d++) q[d] += w * sem.U[j * sem.k + d]; }
  let n = 0; for (let d = 0; d < sem.k; d++) n += q[d] * q[d];
  n = Math.sqrt(n); if (!n) return null;
  for (let d = 0; d < sem.k; d++) q[d] /= n;
  return q;
}
function cosine(q: Float32Array, id: string): number {
  const r = sem!.row.get(id); if (r === undefined) return -1;
  let dot = 0, n = 0; const k = sem!.k;
  for (let d = 0; d < k; d++) { const v = sem!.vecs[r * k + d]; dot += q[d] * v; n += v * v; }
  return n ? dot / Math.sqrt(n) : -1;
}
function docVec(id: string): Float32Array | null {
  const r = sem?.row.get(id); if (r === undefined || !sem) return null;
  const v = new Float32Array(sem.k); let n = 0;
  for (let d = 0; d < sem.k; d++) { v[d] = sem.vecs[r * sem.k + d]; n += v[d] * v[d]; }
  n = Math.sqrt(n) || 1; for (let d = 0; d < sem.k; d++) v[d] /= n;
  return v;
}

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
    post({ kind: "done" });
    if (manifest.semantic) await loadSemantic(baseUrl); // en dernier : ne ralentit jamais l'affichage initial
  } catch (e) {
    post({ kind: "error", message: e instanceof Error ? e.message : String(e) });
  }
}

const DAY = 86400000;
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const top = (m: Map<string, number>, n: number): [string, number][] =>
  [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
const t = (iso?: string) => (iso ? Date.parse(iso) : 0);

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  if (msg.kind === "init") { void load(msg.baseUrl, msg.priority); return; }

  if (msg.kind === "similar") {
    const me = items[indexOf.get(msg.id) ?? -1];
    if (!me) { post({ kind: "similar", reqId: msg.reqId, indices: new Uint32Array(0) }); return; }
    const v = docVec(me.id);
    const mine = new Set(me.tags);
    const scored: { i: number; s: number }[] = [];
    items.forEach((it, i) => {
      if (it.id === me.id) return;
      const inter = it.tags.filter((x) => mine.has(x)).length;
      const jac = inter / (mine.size + it.tags.length - inter || 1);   // tags en commun
      const cos = v ? cosine(v, it.id) : -1;                           // proximité sémantique (si le modèle est chargé)
      let s = Math.max(cos, jac * 1.2);
      if (it.type === me.type) s += 0.03; // à pertinence égale, on préfère le même type
      if (s > 0.3) scored.push({ i, s });
    });
    scored.sort((a, b) => b.s - a.s);
    const indices = Uint32Array.from(scored.slice(0, msg.limit), (x) => x.i);
    post({ kind: "similar", reqId: msg.reqId, indices }, [indices.buffer]);
    return;
  }

  const { q, type, filters, sort, reqId, limit } = msg;
  const query = q.trim();
  let terms: string[] = [];
  let candidates: { i: number; score: number }[];
  let semanticUsed = false;

  if (query) {
    let res = mini.search(query, { combineWith: "AND" });
    if (res.length === 0) res = mini.search(query, { combineWith: "OR" }); // repli : tolérant
    terms = [...new Set(res.slice(0, 50).flatMap((r) => r.terms))];
    const lexMax = res[0]?.score || 1;
    const map = new Map<number, number>(res.map((r) => [r.id as number, r.score / lexMax]));
    const qv = msg.semantic !== false ? encode(query) : null;
    if (qv) {
      // Mélange : 70 % lexical normalisé + 30 % similarité sémantique ; les résultats purement sémantiques
      // ne passent que s'ils sont nettement proches (≥ 0,5 et ≥ 80 % du meilleur score sémantique).
      const sims: { i: number; c: number }[] = [];
      items.forEach((it, i) => { const c = cosine(qv, it.id); if (c > 0) sims.push({ i, c }); });
      sims.sort((a, b) => b.c - a.c);
      const best = sims[0]?.c ?? 0;
      const floor = Math.max(0.5, best * 0.8);
      const cs = new Map(sims.map((x) => [x.i, x.c]));
      for (const x of sims.slice(0, 60)) if (x.c >= floor && !map.has(x.i)) map.set(x.i, 0);
      for (const [i, lex] of map) map.set(i, 0.7 * lex + 0.3 * Math.max(0, cs.get(i) ?? 0));
      semanticUsed = true;
    }
    candidates = [...map].map(([i, score]) => ({ i, score }));
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
    it.agents.forEach((a) => bump(fa, a)); it.tags.forEach((x) => bump(ft, x));
    bump(fl, it.license ?? "Aucune"); bump(fr, it.risk.level);
  }
  const facets: Facets = { agents: top(fa, 12), tags: top(ft, 30), licenses: top(fl, 12), risks: top(fr, 4) };

  // 3) filtres
  const now = Date.now();
  const f = filters;
  const out = inTab.filter(({ i }) => {
    const it = items[i];
    if (f.agents.length && !f.agents.some((a) => it.agents.includes(a))) return false;
    if (f.tags.length && !f.tags.every((x) => it.tags.includes(x))) return false;
    if (f.licenses.length && !f.licenses.includes(it.license ?? "Aucune")) return false;
    if (f.risks.length && !f.risks.includes(it.risk.level)) return false;
    if (f.minStars && it.stars < f.minStars) return false;
    if (f.activityDays && now - t(it.lastCommit) > f.activityDays * DAY) return false;
    if (f.newDays && now - t(it.firstSeen) > f.newDays * DAY) return false;
    if (f.sureOnly && it.type === "mod" && (it.modConfidence ?? 1) < 0.7) return false;
    return true;
  });

  // 4) tri
  const byStars = (a: { i: number }, b: { i: number }) => items[b.i].stars - items[a.i].stars;
  if (sort === "stars" || (sort === "relevance" && !query)) out.sort(byStars);
  else if (sort === "recent") out.sort((a, b) => t(items[b.i].lastCommit) - t(items[a.i].lastCommit));
  else if (sort === "new") out.sort((a, b) => t(items[b.i].firstSeen) - t(items[a.i].firstSeen));
  else if (sort === "created") out.sort((a, b) => t(items[b.i].createdAt) - t(items[a.i].createdAt));
  else if (sort === "trending") out.sort((a, b) => (items[b.i].trend?.d7 ?? -1) - (items[a.i].trend?.d7 ?? -1) || byStars(a, b));
  else out.sort((a, b) => b.score - a.score || byStars(a, b));

  const slice = limit ? out.slice(0, limit) : out;
  const indices = Uint32Array.from(slice, (c) => c.i);
  post({ kind: "result", reqId, indices, total: out.length, terms, facets, counts, semanticUsed }, [indices.buffer]);
};
