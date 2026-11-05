"""Dédoublonnage : même contentHash → garder l'original (non-fork) avec le plus d'étoiles."""
from __future__ import annotations

from .models import Item


def dedupe(items: list[Item], forks: set[str] | None = None) -> list[Item]:
    forks = forks or set()
    best: dict[tuple[str, str], Item] = {}
    for it in items:
        key = (it.type, it.contentHash)
        cur = best.get(key)
        if cur is None or _rank(it, forks) > _rank(cur, forks):
            best[key] = it
    # Garde l'ordre d'origine ; unicité d'id en bonus (même repo+chemin)
    keep = {id(v) for v in best.values()}
    out, seen = [], set()
    for it in items:
        if id(it) in keep and it.id not in seen:
            seen.add(it.id)
            out.append(it)
    return out


def _rank(it: Item, forks: set[str]) -> tuple[int, int, str]:
    # non-fork d'abord, puis étoiles, puis ordre alphabétique stable
    return (0 if it.source.repo in forks else 1, it.stars, "~" + it.source.repo)
