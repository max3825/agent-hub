"""Dédoublonnage en deux passes.

1. Exact : même (type, contentHash) → on garde un seul exemplaire. Le contentHash ne dépend que du
   CONTENU du fichier principal (pas du nom du dossier), donc une copie renommée est détectée.
2. Quasi-doublons : même type + même nom normalisé (« PDF-Skill » ≈ « pdf ») ET résumés très proches,
   ou résumés identiques (assez longs). Les noms génériques d'auteurs différents mais aux résumés
   différents ne sont PAS fusionnés.
Dans les deux cas on garde l'original (non-fork) puis celui qui a le plus d'étoiles.
"""
from __future__ import annotations

import re
from collections import defaultdict

from .models import Item

NEAR_SIMILARITY = 0.6      # Jaccard minimal sur les mots du résumé, à nom normalisé identique
_NOISE = re.compile(r"(?:^|-)(?:skills?|hooks?|plugins?|mods?|claude|code)(?=-|$)")
_STOP = {"the", "a", "an", "to", "of", "and", "or", "for", "in", "with", "from", "your", "you", "is", "are", "on", "de", "le", "la", "les", "des", "du", "un", "une", "et", "pour", "en"}


def normalize_name(name: str) -> str:
    n = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    n = _NOISE.sub("", n).strip("-")
    return n.replace("-", "")


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9àâçéèêëîïôûùüÿœ]{3,}", text.lower()) if w not in _STOP}


def similarity(a: str, b: str) -> float:
    wa, wb = _words(a), _words(b)
    return len(wa & wb) / len(wa | wb) if wa and wb else 0.0


def _rank(it: Item, forks: set[str]) -> tuple[int, int, str]:
    # non-fork d'abord, puis étoiles, puis ordre alphabétique stable
    return (0 if it.source.repo in forks else 1, it.stars, "~" + it.source.repo)


def _keep_best(groups: dict, items: list[Item], forks: set[str]) -> list[Item]:
    keep = set()
    for members in groups.values():
        keep.add(id(max(members, key=lambda i: _rank(i, forks))))
    return [it for it in items if id(it) in keep]


def dedupe(items: list[Item], forks: set[str] | None = None) -> list[Item]:
    forks = forks or set()

    # Passe 1 : doublons exacts (+ unicité d'id)
    exact: dict[tuple[str, str], list[Item]] = defaultdict(list)
    for it in items:
        exact[(it.type, it.contentHash)].append(it)
    out, seen = [], set()
    for it in _keep_best(exact, items, forks):
        if it.id not in seen:
            seen.add(it.id)
            out.append(it)

    # Passe 2 : quasi-doublons (même type, même nom normalisé, résumés proches)
    by_name: dict[tuple[str, str], list[Item]] = defaultdict(list)
    for it in out:
        n = normalize_name(it.name)
        if n:
            by_name[(it.type, n)].append(it)
    drop: set[int] = set()
    for members in by_name.values():
        if len(members) < 2:
            continue
        members = sorted(members, key=lambda i: _rank(i, forks), reverse=True)  # meilleurs d'abord
        kept: list[Item] = []
        for it in members:
            if any(similarity(it.summary_en or it.summary, k.summary_en or k.summary) >= NEAR_SIMILARITY for k in kept):
                drop.add(id(it))
            else:
                kept.append(it)

    # Résumés strictement identiques (et assez longs pour être significatifs), même type
    by_summary: dict[tuple[str, str], list[Item]] = defaultdict(list)
    for it in out:
        if id(it) in drop:
            continue
        s = re.sub(r"\W+", " ", (it.summary_en or it.summary).lower()).strip()
        if len(s) >= 40:
            by_summary[(it.type, s)].append(it)
    for members in by_summary.values():
        if len(members) > 1:
            best = max(members, key=lambda i: _rank(i, forks))
            drop.update(id(m) for m in members if m is not best)

    return [it for it in out if id(it) not in drop]
