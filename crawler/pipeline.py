"""Orchestration : découverte → filtre qualité → analyse (incrémentale) → dédoublonnage → résumés → sorties."""
from __future__ import annotations

import json
import logging
import posixpath
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import SCHEMA_VERSION
from .adapters import ALL_ADAPTERS, Context
from .adapters.marketplaces import MARKETPLACE_PATH, parse_marketplace
from .cache import Cache
from .config import Config
from .dedupe import dedupe
from .detect import detect
from .github import GitHubClient, RateLimited
from .models import Candidate, Detected, Item, RepoMeta, stable_id
from .normalize import build_item, infer_agents
from .outputs import write_outputs
from .summarize import apply_summaries

log = logging.getLogger("crawler.pipeline")
ORIGIN_PRIORITY = ["marketplace", "skills.sh", "awesome", "github"]


def merge_candidates(cands: list[Candidate]) -> list[Candidate]:
    """Un candidat par dépôt (insensible à la casse), origine = la plus « qualifiée » ; ordre de découverte conservé."""
    order: dict[str, str] = {}
    origins: dict[str, set[str]] = {}
    for c in cands:
        k = c.repo.lower().strip("/")
        order.setdefault(k, c.repo.strip("/"))
        origins.setdefault(k, set()).add(c.origin)
    return [Candidate(repo=order[k], origin=next(o for o in ORIGIN_PRIORITY if o in origins[k])) for k in order]


def passes_quality(meta: RepoMeta, cfg: Config, now: datetime) -> str | None:
    """None si OK, sinon la raison du rejet."""
    g = cfg.github
    if meta.archived:
        return "archivé"
    if g.skip_forks and meta.fork:
        return "fork"
    if meta.stars < g.min_stars:
        return f"{meta.stars}★ < {g.min_stars}"
    if g.max_inactive_days and meta.pushed_at:
        pushed = datetime.fromisoformat(meta.pushed_at.replace("Z", "+00:00"))
        if now - pushed > timedelta(days=g.max_inactive_days):
            return "inactif"
    return None


def _annotate_plugins(detected: list[Detected], paths: list[str], gh: GitHubClient, meta: RepoMeta) -> dict[str, str]:
    """Si le dépôt est une marketplace : rattache chaque élément à son plugin ; renvoie {plugin: description}."""
    descs: dict[str, str] = {}
    if MARKETPLACE_PATH not in paths:
        return descs
    text = gh.raw(meta.full_name, meta.default_branch, MARKETPLACE_PATH)
    if not text:
        return descs
    try:
        mk = parse_marketplace(text)
    except Exception as e:  # noqa: BLE001
        log.warning("%s : marketplace.json illisible (%s)", meta.full_name, e)
        return descs
    roots = [(p["path"], p) for p in mk["plugins"] if p["path"]]
    roots.sort(key=lambda r: -len(r[0]))  # racine la plus profonde d'abord
    for d in detected:
        for root, p in roots:
            if root == "." or d.path == root or d.path.startswith(root + "/"):
                d.plugin, d.marketplace = p["name"], mk["name"] or meta.full_name.split("/")[1]
                descs[p["name"]] = p["description"]
                break
    return descs


def analyze_repo(meta: RepoMeta, origin: str, cfg: Config, gh: GitHubClient, first_seen: dict[str, str], now: datetime) -> list[Item]:
    paths, truncated = gh.tree(meta.full_name, meta.default_branch)
    if len(paths) > cfg.github.max_tree_entries:
        log.info("%s : arbre trop grand (%d), ignoré", meta.full_name, len(paths))
        return []
    if truncated:
        log.info("%s : arbre tronqué par l'API (résultats partiels)", meta.full_name)
    detected = detect(paths, cfg.detection, meta.full_name.split("/")[1])[: cfg.github.max_items_per_repo]
    if not detected:
        return []
    plugin_desc = _annotate_plugins(detected, paths, gh, meta)
    readme_cache: list[str] = []

    def readme() -> str:
        if not readme_cache:
            readme_cache.append(next((t for p in ("README.md", "readme.md") if p in paths and (t := gh.raw(meta.full_name, meta.default_branch, p)) is not None), ""))
        return readme_cache[0]

    items: list[Item] = []
    for d in detected:
        text = gh.raw(meta.full_name, meta.default_branch, d.main_file, max_bytes=100_000)
        if text is None:
            continue
        extra: list[str] = []
        if d.type in ("hook", "mod"):  # scripts voisins (hooks/*.sh …) scannés pour le niveau de risque
            sib = [p for p in paths if posixpath.dirname(p) == posixpath.dirname(d.main_file) and p != d.main_file and posixpath.splitext(p)[1] in cfg.detection.hook_script_ext][:5]
            extra = [t for p in sib if (t := gh.raw(meta.full_name, meta.default_branch, p, max_bytes=40_000))]
        needs_readme = d.type == "skill" and "description:" not in text[:1500]
        rd = readme() if needs_readme or d.type != "skill" else ""
        item = build_item(
            d, meta, text, extra, origin=origin, readme=rd, plugin_description=plugin_desc.get(d.plugin or "", ""),
            agents=infer_agents(" ".join(meta.topics), meta.description or "", rd[:3000]), now=now,
            first_seen=first_seen.get(stable_id(meta.full_name, d.path)),
        )
        items.append(item)
    return items


def run(cfg: Config, gh: GitHubClient, cache: Cache, *, limit: int | None, data_dir: Path, index_dir: Path,
        summaries: bool = True, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    budget = min(limit or cfg.github.max_repos, cfg.github.max_repos)
    ctx = Context(cfg=cfg, gh=gh, limit=budget)

    cands: list[Candidate] = []
    try:
        for cls in ALL_ADAPTERS:
            cands += cls(ctx).safe_discover()
    except RateLimited as e:
        log.warning("rate limit pendant la découverte : %s", e)
    repos = merge_candidates(cands)[:budget]
    log.info("%d dépôt(s) à analyser (budget %d)", len(repos), budget)

    first_seen = cache.load_map("first_seen")
    prev = data_dir / "items.json"  # filet de sécurité si le cache a été purgé : on reprend les firstSeen déjà publiés
    if prev.exists():
        try:
            for old in json.loads(prev.read_text("utf-8")):
                first_seen.setdefault(old["id"], old["firstSeen"])
        except (OSError, ValueError, KeyError, TypeError):
            log.warning("items.json existant illisible : firstSeen non repris")
    all_items: list[Item] = []
    forks: set[str] = set()
    stats = {"repos": len(repos), "analyzed": 0, "from_cache": 0, "rejected": 0, "errors": 0}
    now_iso = now.isoformat().replace("+00:00", "Z")

    for cand in repos:
        try:
            meta = gh.repo(cand.repo)
            if not meta:
                stats["errors"] += 1
                continue
            if meta.fork:
                forks.add(meta.full_name)
            if (why := passes_quality(meta, cfg, now)):
                log.debug("%s rejeté : %s", meta.full_name, why)
                stats["rejected"] += 1
                continue
            cached = cache.get("repo", meta.full_name.lower())
            if cached and cached.get("pushed_at") == meta.pushed_at and cached.get("schema") == SCHEMA_VERSION:
                items = [Item.model_validate(i) for i in cached["items"]]
                for it in items:  # on rafraîchit seulement les métadonnées volatiles
                    it.stars, it.lastCommit = meta.stars, meta.pushed_at or it.lastCommit
                stats["from_cache"] += 1
            else:
                items = analyze_repo(meta, cand.origin, cfg, gh, first_seen, now)
                cache.set("repo", meta.full_name.lower(), {"pushed_at": meta.pushed_at, "schema": SCHEMA_VERSION, "items": [i.model_dump(mode="json") for i in items]})
                stats["analyzed"] += 1
            for it in items:
                it.source.origin = cand.origin
                it.firstSeen = first_seen.setdefault(it.id, it.firstSeen if it.firstSeen else now_iso)
            all_items += items
        except RateLimited as e:
            log.warning("rate limit : arrêt anticipé du crawl (%s)", e)
            break
        except Exception as e:  # noqa: BLE001 — un dépôt défaillant ne doit pas bloquer les autres
            log.warning("%s ignoré (%s: %s)", cand.repo, type(e).__name__, e)
            stats["errors"] += 1

    cache.save_map("first_seen", first_seen)
    items = dedupe(all_items, forks)
    stats["duplicates_removed"] = len(all_items) - len(items)

    if summaries:
        stats["summaries"] = apply_summaries(items, cache, max_per_run=cfg.summaries.max_per_run, batch_size=cfg.summaries.batch_size)

    items.sort(key=lambda i: (-i.stars, i.name))
    items_path = data_dir / "items.json"
    if not items and items_path.exists() and items_path.stat().st_size > 10:
        log.error("aucun élément collecté (réseau ? rate limit ?) : data/items.json existant conservé")
        stats["kept_previous"] = True
        return stats
    stats["meta"] = write_outputs(items, data_dir, index_dir, now)
    stats["total"] = len(items)
    stats["requests"] = gh.requests
    return stats
