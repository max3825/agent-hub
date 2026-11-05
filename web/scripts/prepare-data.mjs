// Prépare les données servies par le site : web/public/index/{manifest.json, items-*.json}
//
//   DATA_SOURCE=sample (défaut) → data/sample-items.json (démo, aucun crawl requis)
//   DATA_SOURCE=real            → data/items.json produit par `python -m crawler`
//
// Si le crawler a déjà écrit des shards « réels », ils sont conservés tels quels.
// Le format des shards est identique à celui de crawler/outputs.py.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = path.join(root, "web", "public", "index");
const SHARD_SIZE = 2000;
const mode = (process.env.DATA_SOURCE || "sample").toLowerCase();

const manifestPath = path.join(outDir, "manifest.json");
if (mode === "real" && fs.existsSync(manifestPath)) {
  const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!m.demo) { console.log(`[data] shards réels déjà présents (${m.total} entrées)`); process.exit(0); }
}

let file = mode === "real" ? path.join(root, "data", "items.json") : path.join(root, "data", "sample-items.json");
let demo = mode !== "real";
if (mode === "real" && !fs.existsSync(file)) {
  console.warn("[data] data/items.json introuvable → repli sur les données de démo (lancez `python -m crawler`).");
  file = path.join(root, "data", "sample-items.json"); demo = true;
}
const items = JSON.parse(fs.readFileSync(file, "utf8"));

let generatedAt = new Date().toISOString();
const metaFile = path.join(root, "data", "meta.json");
if (!demo && fs.existsSync(metaFile)) generatedAt = JSON.parse(fs.readFileSync(metaFile, "utf8")).generatedAt ?? generatedAt;
if (demo) generatedAt = new Date(Date.now() - 3 * 3600 * 1000).toISOString(); // « il y a 3 h » dans la démo

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const counts = { skill: 0, hook: 0, mod: 0 };
const shards = [];
for (const type of ["skill", "hook", "mod"]) {
  const list = items.filter((i) => i.type === type).sort((a, b) => b.stars - a.stars);
  counts[type] = list.length;
  for (let n = 0; n * SHARD_SIZE < list.length || (n === 0 && list.length === 0); n++) {
    if (list.length === 0) break;
    const chunk = list.slice(n * SHARD_SIZE, (n + 1) * SHARD_SIZE);
    const name = `items-${type}-${n}.json`;
    fs.writeFileSync(path.join(outDir, name), JSON.stringify(chunk));
    shards.push({ file: name, type, count: chunk.length });
  }
}
fs.writeFileSync(manifestPath, JSON.stringify({ version: 1, generatedAt, total: items.length, counts, shards, demo }));
console.log(`[data] ${items.length} entrées (${demo ? "démo" : "réel"}) → ${shards.length} shard(s)`);
