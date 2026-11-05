"""Orchestration : découverte → filtre qualité → analyse (incrémentale) → dédoublonnage → résumés → sorties."""
from __future__ import annotations

import json
import logging
import os
import posixpath
import time
from collections import Counter
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
from .mods import score_mod
from .normalize import build_item
from .trend import compute_trend, update_history
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


def analyze_repo(meta: RepoMeta, origin: str, cfg: Config, gh: GitHubClient, first_seen: dict[str, str], now: datetime, state: dict | None = None) -> list[Item]:
    state = state if state is not None else {}
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
        confidence = None
        if d.type == "mod":
            confidence, _why = score_mod(d, text)
            if confidence < cfg.detection.mod_min_confidence:   # détection trop incertaine : écartée
                state["mods_dropped"] = state.get("mods_dropped", 0) + 1
                continue
        needs_readme = d.type == "skill" and "description:" not in text[:1500]
        rd = readme() if needs_readme or d.type != "skill" else ""
        item = build_item(
            d, meta, text, extra, origin=origin, readme=rd, plugin_description=plugin_desc.get(d.plugin or "", ""),
            now=now, first_seen=first_seen.get(stable_id(meta.full_name, d.path)), paths=paths,
            created_at=meta.created_at, created_exact=False, mod_confidence=confidence,
        )
        items.append(item)
    return items


def reason_key(why: str) -> str:
    return "archived" if why.startswith("archiv") else "fork" if why == "fork" else "inactive" if why == "inactif" else "low_stars"


def apply_created(items: list[Item], meta: RepoMeta, gh: GitHubClient, cache: Cache, state: dict, budget: int) -> None:
    """Date de création exacte (1er commit du chemin) : cache permanent, budget de recherches par exécution."""
    for it in items:
        if it.createdExact:
            continue
        hit = cache.get("created", it.id)
        if hit:
            it.createdAt, it.createdExact = hit, True
        elif state.get("lookups", 0) < budget:
            state["lookups"] = state.get("lookups", 0) + 1
            try:
                d = gh.first_commit_date(meta.full_name, it.source.path if it.source.path != "." else "", meta.default_branch)
            except RateLimited:
                state["lookups"] = budget  # on arrête les recherches mais pas le crawl
                return
            if d:
                cache.set("created", it.id, d)
                it.createdAt, it.createdExact = d, True
        if not it.createdAt:
            it.createdAt, it.createdExact = meta.created_at, False


def run(cfg: Config, gh: GitHubClient, cache: Cache, *, limit: int | None, data_dir: Path, index_dir: Path,
        summaries: bool = True, now: datetime | None = None, max_minutes: float | None = None) -> dict:
    t0 = time.monotonic()
    now = now or datetime.now(timezone.utc)
    budget = min(limit or cfg.github.max_repos, cfg.github.max_repos)
    minutes = max_minutes if max_minutes is not None else float(os.environ.get("CRAWL_MAX_MINUTES") or cfg.github.max_runtime_minutes or 0)
    deadline = t0 + minutes * 60 if minutes else None
    ctx = Context(cfg=cfg, gh=gh, limit=budget)

    cands: list[Candidate] = []
    adapter_stats: dict[str, dict] = {}
    try:
        for cls in ALL_ADAPTERS:
            ad = cls(ctx)
            found = ad.safe_discover()
            adapter_stats[ad.name] = {"candidates": len(found), "error": ad.error}
            cands += found
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
    state: dict = {}
    rejected: Counter[str] = Counter()
    stats: dict = {"repos": len(repos), "analyzed": 0, "from_cache": 0, "rejected": 0, "errors": 0, "stale_cache": 0, "truncated": False}
    now_iso = now.isoformat().replace("+00:00", "Z")
    cl_budget = int(cfg.github.max_creation_lookups)

    for n, cand in enumerate(repos):
        try:
            cached = cache.get("repo", cand.repo.lower())
            if deadline and time.monotonic() > deadline:
                # Budget de temps dépassé : on ne perd rien, les dépôts restants reprennent leur dernière analyse connue.
                stats["truncated"] = True
                if cached and cached.get("schema") == SCHEMA_VERSION:
                    items = [Item.model_validate(i) for i in cached["items"]]
                    stats["stale_cache"] += 1
                    for it in items:
                        it.source.origin = cand.origin
                        it.firstSeen = first_seen.setdefault(it.id, it.firstSeen or now_iso)
                    all_items += items
                continue
            meta = gh.repo(cand.repo)
            if not meta:
                stats["errors"] += 1
                continue
            if meta.fork:
                forks.add(meta.full_name)
            if (why := passes_quality(meta, cfg, now)):
                log.debug("%s rejeté : %s", meta.full_name, why)
                stats["rejected"] += 1
                rejected[reason_key(why)] += 1
                continue
            if cached and cached.get("pushed_at") == meta.pushed_at and cached.get("schema") == SCHEMA_VERSION:
                items = [Item.model_validate(i) for i in cached["items"]]
                for it in items:  # on rafraîchit seulement les métadonnées volatiles
                    it.stars, it.lastCommit = meta.stars, meta.pushed_at or it.lastCommit
                stats["from_cache"] += 1
            else:
                items = analyze_repo(meta, cand.origin, cfg, gh, first_seen, now, state)
                stats["analyzed"] += 1
            apply_created(items, meta, gh, cache, state, cl_budget)
            if not (cached and cached.get("pushed_at") == meta.pushed_at and cached.get("schema") == SCHEMA_VERSION) or state.get("lookups"):
                cache.set("repo", meta.full_name.lower(), {"pushed_at": meta.pushed_at, "schema": SCHEMA_VERSION, "items": [i.model_dump(mode="json") for i in items]})
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
        if n and n % 50 == 0:
            log.info("progression : %d/%d dépôts (%.0f s)", n, len(repos), time.monotonic() - t0)

    cache.save_map("first_seen", first_seen)
    items = dedupe(all_items, forks)
    stats["duplicates_removed"] = len(all_items) - len(items)

    # Tendances : instantané quotidien des étoiles
    hist = cache.load_map("stars_history")
    today = now.date()
    for it in items:
        it.trend = compute_trend(hist.get(it.id, {}), it.stars, today)
        update_history(hist, it.id, it.stars, today)
    cache.save_map("stars_history", hist)

    if summaries:
        stats["summaries"] = apply_summaries(items, cache, max_per_run=cfg.summaries.max_per_run, batch_size=cfg.summaries.batch_size)

    items.sort(key=lambda i: (-i.stars, i.name))
    items_path = data_dir / "items.json"
    if not items and items_path.exists() and items_path.stat().st_size > 10:
        log.error("aucun élément collecté (réseau ? rate limit ?) : data/items.json existant conservé")
        stats["kept_previous"] = True
        return stats
    stats.update({
        "total": len(items), "requests": gh.requests, "duration_s": round(time.monotonic() - t0),
        "adapters": adapter_stats, "rejected_by_reason": dict(rejected), "mods_dropped_low_confidence": state.get("mods_dropped", 0),
        "creation_lookups": state.get("lookups", 0),
        "exact_created": sum(1 for i in items if i.createdExact),
        "by_origin": dict(Counter(i.source.origin for i in items)),
    })
    stats["meta"] = write_outputs(items, data_dir, index_dir, now, stats)
    return stats
