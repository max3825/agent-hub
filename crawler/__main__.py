"""Point d'entrée : `python -m crawler [--limit 200]`."""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from .cache import Cache
from .config import ROOT, load_config
from .github import GitHubClient
from .pipeline import run


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="crawler", description="Crawl des skills, hooks et mods d'agents IA de code.")
    ap.add_argument("--limit", type=int, default=None, help="nombre max de dépôts analysés (budget d'appels API)")
    ap.add_argument("--config", default=None, help="chemin de sources.yaml (défaut : crawler/sources.yaml)")
    ap.add_argument("--data-dir", default=str(ROOT / "data"))
    ap.add_argument("--index-dir", default=str(ROOT / "web" / "public" / "index"))
    ap.add_argument("--cache-dir", default=str(ROOT / ".cache"))
    ap.add_argument("--max-minutes", type=float, default=None, help="budget de temps : au-delà, les dépôts restants reprennent leur dernière analyse (cache)")
    ap.add_argument("--no-summaries", action="store_true", help="ne génère aucun résumé via l'API (repli uniquement)")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if a.verbose else logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s", datefmt="%H:%M:%S")
    logging.getLogger("httpx").setLevel(logging.WARNING)
    log = logging.getLogger("crawler")

    cfg = load_config(a.config)
    cache = Cache(a.cache_dir)
    gh = GitHubClient(cache=cache)
    if not gh.token:
        log.warning("GITHUB_TOKEN absent : limite de 60 requêtes/h, recherche de code désactivée. Définissez-le pour un vrai crawl.")
    stats = run(cfg, gh, cache, limit=a.limit, data_dir=Path(a.data_dir), index_dir=Path(a.index_dir), summaries=not a.no_summaries, max_minutes=a.max_minutes)
    log.info("terminé : %s", json.dumps(stats, ensure_ascii=False, default=str))
    return 1 if stats.get("kept_previous") else 0


if __name__ == "__main__":
    sys.exit(main())
