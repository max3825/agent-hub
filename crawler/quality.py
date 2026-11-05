"""Filtre qualité : écarte ce qui n'a pas sa place dans un annuaire (modèles, exemples, résumés vides…).

Appliqué sur TOUS les éléments (y compris ceux repris du cache) avant le dédoublonnage, donc un nouveau critère
nettoie immédiatement l'existant sans ré-analyse. Chaque règle est configurable dans `sources.yaml` (section `quality`).
Heuristiques : un faux positif retire un élément légitime, un faux négatif laisse passer du bruit — les compteurs
par raison sont publiés (page « Santé du crawl ») pour pouvoir ajuster.
"""
from __future__ import annotations

import re
from collections import Counter

from .config import QualityCfg
from .detect import matches
from .models import Item

FALLBACK_SUMMARY = re.compile(r"^(Skill|Hook|Mod) « .* » \(.+/.+\)\.?$")


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def reject_reason(it: Item, cfg: QualityCfg) -> str | None:
    """Raison du rejet, ou None si l'élément est conservé."""
    if any(matches(it.source.path, g) for g in cfg.exclude_paths):
        return "excluded_path"
    n = _norm(it.name)
    if n in {_norm(x) for x in cfg.exclude_names} or any(re.search(p, n) for p in cfg.exclude_name_patterns):
        return "placeholder_name"
    text = f"{it.summary} {it.summary_en}"
    if any(re.search(p, text, re.I) for p in cfg.placeholder_summary_patterns):
        return "placeholder_summary"
    # Sans vraie description (résumé de repli ou trop court) : on ne garde que les éléments déjà très populaires.
    if (FALLBACK_SUMMARY.match(it.summary_en.strip()) or len(it.summary_en.strip()) < cfg.min_summary_len) and it.stars < cfg.undescribed_min_stars:
        return "no_description"
    return None


def filter_items(items: list[Item], cfg: QualityCfg) -> tuple[list[Item], Counter[str]]:
    if not cfg.enabled:
        return items, Counter()
    kept, why = [], Counter()
    for it in items:
        r = reject_reason(it, cfg)
        if r:
            why[r] += 1
        else:
            kept.append(it)
    return kept, why
