// Après `vite build` : pages statiques par élément + 404.html + sitemap.xml.
//
//  dist/i/<id>/index.html   méta (titre, description, Open Graph, JSON-LD) pour le référencement et l'aperçu des liens
//                           partagés ; redirige les humains vers l'app (`?item=<id>`).
//  dist/404.html            n'importe quelle URL /i/<id>/ non pré-générée est redirigée de la même façon (GitHub Pages
//                           sert 404.html pour les chemins inconnus).
//  dist/sitemap.xml         + ligne `Sitemap:` dans robots.txt (si SITE_URL est défini)
//
// Variables : SITE_URL (ex. https://max3825.github.io/agent-hub, sans slash final) · MAX_STATIC_PAGES (défaut 8000, triés par étoiles).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const site = (process.env.SITE_URL || "").replace(/\/$/, "");
const MAX = Number(process.env.MAX_STATIC_PAGES || 8000);
const manifest = JSON.parse(fs.readFileSync(path.join(dist, "index", "manifest.json"), "utf8"));

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const LABEL = { skill: "Skill", hook: "Hook", mod: "Mod" };

const redirect = `<script>(function(){var m=location.pathname.match(/\\/i\\/([0-9a-f]{16})\\/?$/);if(m){location.replace(location.pathname.slice(0,m.index+1)+"?item="+m[1]);}})();</script>`;

let items = [];
for (const s of manifest.shards) items = items.concat(JSON.parse(fs.readFileSync(path.join(dist, "index", s.file), "utf8")));
items.sort((a, b) => b.stars - a.stars);
const pages = items.slice(0, MAX);

for (const it of pages) {
  const title = `${it.name} — ${LABEL[it.type]} pour agents IA de code | Agent Hub`;
  const desc = (it.summary_en || it.summary || "").slice(0, 200);
  const canonical = site ? `${site}/i/${it.id}/` : "";
  const ld = { "@context": "https://schema.org", "@type": "SoftwareSourceCode", name: it.name, description: desc, codeRepository: `https://github.com/${it.source.repo}`, license: it.license || undefined };
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ""}
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
${redirect}
</head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem">
<h1>${esc(it.name)}</h1><p>${esc(it.summary)}</p><p>${esc(it.source.repo)} · ${it.stars} ★</p>
<p><a href="../../?item=${it.id}">Ouvrir dans Agent Hub</a> · <a href="${esc(it.source.url)}">Source</a></p>
</body></html>`;
  const dir = path.join(dist, "i", it.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
}

fs.writeFileSync(path.join(dist, "404.html"), `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Agent Hub</title><meta name="viewport" content="width=device-width, initial-scale=1">${redirect}</head><body style="font-family:system-ui,sans-serif;margin:3rem auto;max-width:30rem;padding:0 1rem"><h1>Page introuvable</h1><p><a href="./">Retour à Agent Hub</a></p></body></html>`);

if (site) {
  const urls = [`${site}/`, ...pages.map((p) => `${site}/i/${p.id}/`)];
  fs.writeFileSync(path.join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u)}</loc></url>`).join("\n")}\n</urlset>\n`);
  const robots = path.join(dist, "robots.txt");
  fs.writeFileSync(robots, (fs.existsSync(robots) ? fs.readFileSync(robots, "utf8").trimEnd() + "\n" : "User-agent: *\nAllow: /\n") + `Sitemap: ${site}/sitemap.xml\n`);
}
console.log(`[pages] ${pages.length} page(s) statique(s) + 404.html${site ? " + sitemap.xml" : " (SITE_URL absent : pas de sitemap)"}`);
