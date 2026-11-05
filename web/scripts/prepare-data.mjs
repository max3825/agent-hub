// Prépare les données servies par le site : web/public/index/…
//
//   DATA_SOURCE=sample (défaut) → data/sample-items.json (+ sample-semantic.json, sample-stats.json) : démo, aucun crawl requis
//   DATA_SOURCE=real            → data/items.json (+ semantic.json, stats.json) produits par `python -m crawler`
//
// Si le crawler a déjà écrit des shards « réels » (manifest.demo === false), ils sont conservés tels quels.
// Le format est identique à celui de crawler/outputs.py :
//   manifest.json · items-<type>-<n>.json (sans preview/outline) · detail/<id[:2]>.json · semantic.json · stats.json
// + collections.json (data/collections.json, commun aux deux modes).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataDir = path.join(root, "data");
const outDir = path.join(root, "web", "public", "index");
const SHARD_SIZE = 2000;
const mode = (process.env.DATA_SOURCE || "sample").toLowerCase();
const manifestPath = path.join(outDir, "manifest.json");

function copyCollections() {
  const src = path.join(dataDir, "collections.json");
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outDir, "collections.json"));
}

if (mode === "real" && fs.existsSync(manifestPath)) {
  const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!m.demo) { copyCollections(); console.log(`[data] shards réels déjà présents (${m.total} entrées)`); process.exit(0); }
}

let prefix = mode === "real" ? "" : "sample-";
let file = path.join(dataDir, `${prefix}items.json`);
let demo = mode !== "real";
if (mode === "real" && !fs.existsSync(file)) {
  console.warn("[data] data/items.json introuvable → repli sur les données de démo (lancez `python -m crawler`).");
  prefix = "sample-"; file = path.join(dataDir, "sample-items.json"); demo = true;
}
const items = JSON.parse(fs.readFileSync(file, "utf8"));

let generatedAt = new Date().toISOString();
const metaFile = path.join(dataDir, "meta.json");
if (!demo && fs.existsSync(metaFile)) generatedAt = JSON.parse(fs.readFileSync(metaFile, "utf8")).generatedAt ?? generatedAt;
if (demo) generatedAt = new Date(Date.now() - 3 * 3600 * 1000).toISOString(); // « il y a 3 h » dans la démo

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, "detail"), { recursive: true });

// Détails (preview/outline) servis à part, par seau de 2 caractères d'id : chargés à l'ouverture d'une fiche.
const details = {};
for (const it of items) {
  const extra = {};
  for (const k of ["preview", "outline"]) if (k in it) { extra[k] = it[k]; delete it[k]; }
  if (Object.keys(extra).length) (details[it.id.slice(0, 2)] ??= {})[it.id] = extra;
}
for (const [bucket, content] of Object.entries(details)) fs.writeFileSync(path.join(outDir, "detail", `${bucket}.json`), JSON.stringify(content));

const counts = { skill: 0, hook: 0, mod: 0 };
const shards = [];
for (const type of ["skill", "hook", "mod"]) {
  const list = items.filter((i) => i.type === type).sort((a, b) => b.stars - a.stars);
  counts[type] = list.length;
  for (let n = 0; n * SHARD_SIZE < list.length; n++) {
    const chunk = list.slice(n * SHARD_SIZE, (n + 1) * SHARD_SIZE);
    const name = `items-${type}-${n}.json`;
    fs.writeFileSync(path.join(outDir, name), JSON.stringify(chunk));
    shards.push({ file: name, type, count: chunk.length });
  }
}

const copyIf = (name, to) => { const f = path.join(dataDir, `${prefix}${name}`); if (fs.existsSync(f)) { fs.copyFileSync(f, path.join(outDir, to)); return true; } return false; };
const semantic = copyIf("semantic.json", "semantic.json");
const stats = copyIf("stats.json", "stats.json");
copyCollections();

fs.writeFileSync(manifestPath, JSON.stringify({ version: 2, generatedAt, total: items.length, counts, shards, demo, semantic, details: Object.keys(details).length > 0, stats }));
console.log(`[data] ${items.length} entrées (${demo ? "démo" : "réel"}) → ${shards.length} shard(s)${semantic ? " + sémantique" : ""}${stats ? " + stats" : ""}`);
