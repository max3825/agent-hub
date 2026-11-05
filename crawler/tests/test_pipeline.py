"""Pipeline de bout en bout avec un faux client GitHub (aucun réseau)."""
import json
from datetime import datetime, timezone

from crawler.cache import Cache
from crawler.config import load_config
from crawler.models import RepoMeta
from crawler.pipeline import passes_quality, run

NOW = datetime(2026, 11, 5, tzinfo=timezone.utc)
FILES = {
    "good/repo": {"skills/pdf/SKILL.md": "---\nname: pdf\ndescription: Fills PDF forms from JSON data and validates required fields.\n---\nbody",
                  "plugins/fmt/hooks/hooks.json": '{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"rm -rf /tmp/x"}]}]}}',
                  "README.md": "# Good\n\nA nice repository with several extensions inside."},
    "copy/repo": {"skills/pdf/SKILL.md": "---\nname: pdf\ndescription: Fills PDF forms from JSON data and validates required fields.\n---\nbody"},     # même contenu → doublon
}
METAS = {
    "good/repo": RepoMeta(full_name="good/repo", stars=900, pushed_at="2026-11-01T00:00:00Z", license="MIT", created_at="2024-01-01T00:00:00Z"),
    "copy/repo": RepoMeta(full_name="copy/repo", stars=30, pushed_at="2026-11-01T00:00:00Z"),
    "tiny/repo": RepoMeta(full_name="tiny/repo", stars=2, pushed_at="2026-11-01T00:00:00Z"),
    "old/repo": RepoMeta(full_name="old/repo", stars=500, pushed_at="2020-01-01T00:00:00Z"),
    "arch/repo": RepoMeta(full_name="arch/repo", stars=500, pushed_at="2026-11-01T00:00:00Z", archived=True),
}


class FakeGH:
    token = "x"
    requests = 0

    def __init__(self): self.tree_calls = 0
    def repo(self, name): return METAS.get(name)
    def tree(self, name, branch):
        self.tree_calls += 1
        return list(FILES.get(name, {})), False
    def raw(self, repo, ref, path, max_bytes=0): return FILES.get(repo, {}).get(path)
    def search_repos(self, q, pages=1): return [METAS[k] for k in METAS] if "topic:claude-code" in q else []
    def search_code(self, q, pages=1): return []
    def first_commit_date(self, name, path, branch):
        self.created_calls = getattr(self, 'created_calls', 0) + 1
        return "2025-03-01T00:00:00Z"


def cfg():
    c = load_config()
    c.seed_repos, c.marketplaces, c.awesome_lists = [], [], []
    c.skills_sh.enabled = False
    c.github.topics = ["claude-code"]
    return c


def test_quality_filter():
    c = cfg()
    assert passes_quality(METAS["good/repo"], c, NOW) is None
    assert passes_quality(METAS["tiny/repo"], c, NOW)
    assert passes_quality(METAS["old/repo"], c, NOW) == "inactif"
    assert passes_quality(METAS["arch/repo"], c, NOW) == "archivé"


def test_end_to_end_and_incremental(tmp_path):
    data, index, cache = tmp_path / "data", tmp_path / "index", Cache(tmp_path / "cache")
    gh = FakeGH()
    stats = run(cfg(), gh, cache, limit=None, data_dir=data, index_dir=index, summaries=False, now=NOW)

    items = json.loads((data / "items.json").read_text())
    assert {(i["type"], i["source"]["repo"]) for i in items} == {("skill", "good/repo"), ("hook", "good/repo")}   # doublon retiré
    hook = next(i for i in items if i["type"] == "hook")
    assert hook["risk"]["level"] == "medium" and hook["hookCommands"] == ["rm -rf /tmp/x"]
    assert stats["duplicates_removed"] == 1 and stats["rejected"] == 3 and stats["analyzed"] == 2

    meta = json.loads((data / "meta.json").read_text())
    assert meta["counts"] == {"skill": 1, "hook": 1, "mod": 0}
    manifest = json.loads((index / "manifest.json").read_text())
    assert manifest["total"] == 2 and manifest["demo"] is False
    assert json.loads((index / manifest["shards"][0]["file"]).read_text())

    # 2e passage, rien n'a changé : aucun re-parcours d'arbre (cache par pushed_at)
    gh2 = FakeGH()
    stats2 = run(cfg(), gh2, cache, limit=None, data_dir=data, index_dir=index, summaries=False, now=NOW)
    assert gh2.tree_calls == 0 and stats2["from_cache"] == 2 and stats2["analyzed"] == 0


def test_limit_caps_repos_and_empty_run_keeps_previous_output(tmp_path):
    data, index, cache = tmp_path / "data", tmp_path / "index", Cache(tmp_path / "cache")
    stats = run(cfg(), FakeGH(), cache, limit=1, data_dir=data, index_dir=index, summaries=False, now=NOW)
    assert stats["repos"] == 1

    class Down(FakeGH):
        def repo(self, name): return None
        def search_repos(self, q, pages=1): return []
    before = (data / "items.json").read_text()
    stats = run(cfg(), Down(), Cache(tmp_path / "c2"), limit=None, data_dir=data, index_dir=index, summaries=False, now=NOW)
    assert stats.get("empty") and stats.get("kept_previous") and (data / "items.json").read_text() == before


def test_first_seen_is_persisted(tmp_path):
    data, index, cache = tmp_path / "data", tmp_path / "index", Cache(tmp_path / "cache")
    run(cfg(), FakeGH(), cache, limit=None, data_dir=data, index_dir=index, summaries=False, now=NOW)
    later = datetime(2026, 12, 1, tzinfo=timezone.utc)
    run(cfg(), FakeGH(), cache, limit=None, data_dir=data, index_dir=index, summaries=False, now=later)
    assert all(i["firstSeen"].startswith("2026-11-05") for i in json.loads((data / "items.json").read_text()))


def test_created_date_exact_cached_and_trend_and_stats(tmp_path):
    data, index, cache = tmp_path / "data", tmp_path / "index", Cache(tmp_path / "cache")
    gh = FakeGH()
    stats = run(cfg(), gh, cache, limit=None, data_dir=data, index_dir=index, summaries=False, now=NOW)
    items = json.loads((data / "items.json").read_text())
    assert all(i["createdAt"] == "2025-03-01T00:00:00Z" and i["createdExact"] for i in items)
    assert gh.created_calls == 3 and stats["exact_created"] == 2 and "trend" not in items[0]   # 1er relevé : pas de tendance

    # 2 jours plus tard, +50 étoiles : tendance calculée, aucune nouvelle recherche de date (cache permanent)
    METAS["good/repo"] = METAS["good/repo"].model_copy(update={"stars": 950})
    try:
        gh2 = FakeGH()
        later = datetime(2026, 11, 7, tzinfo=timezone.utc)
        run(cfg(), gh2, cache, limit=None, data_dir=data, index_dir=index, summaries=False, now=later)
        items = json.loads((data / "items.json").read_text())
        assert all(i["trend"] == {"d7": 50, "d30": 50} for i in items)
        assert getattr(gh2, "created_calls", 0) == 0
    finally:
        METAS["good/repo"] = METAS["good/repo"].model_copy(update={"stars": 900})

    health = json.loads((data / "stats.json").read_text())
    assert health["rejected_by_reason"] == {"low_stars": 1, "inactive": 1, "archived": 1} and "github_topics" in health["adapters"]
    manifest = json.loads((index / "manifest.json").read_text())
    assert manifest["stats"] is True and (index / "stats.json").exists()
    det = json.loads((index / "detail" / f"{items[0]['id'][:2]}.json").read_text())
    assert items[0]["id"] in det and "preview" not in json.loads((index / manifest["shards"][0]["file"]).read_text())[0]


def test_time_budget_keeps_previous_analysis_instead_of_shrinking(tmp_path):
    data, index, cache = tmp_path / "data", tmp_path / "index", Cache(tmp_path / "cache")
    run(cfg(), FakeGH(), cache, limit=None, data_dir=data, index_dir=index, summaries=False, now=NOW)
    n_before = len(json.loads((data / "items.json").read_text()))
    stats = run(cfg(), FakeGH(), cache, limit=None, data_dir=data, index_dir=index, summaries=False, now=NOW, max_minutes=1e-9)
    assert stats["truncated"] and stats["stale_cache"] >= 1
    assert len(json.loads((data / "items.json").read_text())) == n_before


def _warm(tmp_path):
    data, index, cache = tmp_path / "data", tmp_path / "index", Cache(tmp_path / "cache")
    run(cfg(), FakeGH(), cache, limit=None, data_dir=data, index_dir=index, summaries=False, now=NOW)
    return data, index, cache


def test_rate_limit_falls_back_to_cache_instead_of_dropping_repos(tmp_path):
    from crawler.github import RateLimited
    data, index, cache = _warm(tmp_path)
    n_before = len(json.loads((data / "items.json").read_text()))

    class Limited(FakeGH):
        def repo(self, name): raise RateLimited("attente de 3000s")

    stats = run(cfg(), Limited(), cache, limit=None, data_dir=data, index_dir=index, summaries=False, now=NOW)
    assert stats["rate_limited"] and stats["stale_cache"] >= 1
    assert len(json.loads((data / "items.json").read_text())) == n_before          # rien n'a disparu


def test_old_schema_cache_is_reused_as_fallback_but_reanalyzed_when_possible(tmp_path):
    import crawler.pipeline as pl
    data, index, cache = _warm(tmp_path)
    # on « vieillit » le cache d'un dépôt : ancien schéma
    entry = cache.get("repo", "good/repo")
    cache.set("repo", "good/repo", {**entry, "schema": 1})
    # budget de temps épuisé : l'ancien cache sert de repli (le site ne rétrécit pas)
    stats = run(cfg(), FakeGH(), cache, limit=None, data_dir=data, index_dir=index, summaries=False, now=NOW, max_minutes=1e-9)
    assert stats["truncated"] and any(i["source"]["repo"] == "good/repo" for i in json.loads((data / "items.json").read_text()))
    # avec du temps : le dépôt est ré-analysé (schéma courant)
    gh = FakeGH()
    run(cfg(), gh, cache, limit=None, data_dir=data, index_dir=index, summaries=False, now=NOW)
    assert gh.tree_calls >= 1 and cache.get("repo", "good/repo")["schema"] == pl.SCHEMA_VERSION


def test_empty_crawl_writes_nothing_and_signals_failure(tmp_path):
    from crawler.__main__ import main  # noqa: F401  (le code retour 1 repose sur stats["empty"])

    class Down(FakeGH):
        def repo(self, name): return None
        def search_repos(self, q, pages=1): return []

    data, index = tmp_path / "data", tmp_path / "index"
    stats = run(cfg(), Down(), Cache(tmp_path / "c"), limit=None, data_dir=data, index_dir=index, summaries=False, now=NOW)
    assert stats["empty"] and not (data / "items.json").exists() and not index.exists()
