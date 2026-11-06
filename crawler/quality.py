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


# Dossiers de code applicatif : un dossier `hooks/` ici contient des hooks React/Vue, pas des hooks d'agent.
APP_DIRS = {"src", "components", "ui", "web", "frontend", "client", "app", "lib", "pages", "renderer", "server", "packages", "node_modules"}
AGENT_DIRS = {".claude", ".claude-plugin", ".codex", ".cursor", ".gemini", ".windsurf", ".github"}
GENERIC_NAMES = {"src", "claude", "hooks", "hook", "plugin", "plugins", "commands", "agents", "skills", "opencode", "codex", "cursor", "gemini", "root", "app", "lib"}


def _segments(path: str) -> list[str]:
    return [x for x in path.split("/") if x and x != "."]


def is_app_hook(it: Item) -> bool:
    """Hook détecté dans du code applicatif (ex. `web/src/hooks`) : faux positif de la règle « dossier hooks/ »."""
    seg = _segments(it.source.path)
    return it.type == "hook" and bool(APP_DIRS & set(seg)) and not (AGENT_DIRS & set(seg)) and not any("plugin" in x for x in seg)


def is_skill_internal(it: Item) -> bool:
    """Mod situé DANS un skill (ex. skills/x/agents/…) : fait partie du skill, pas une extension à part."""
    seg = _segments(it.source.path)
    return it.type == "mod" and "skills" in seg and ".claude-plugin" not in seg


def fix_name(it: Item) -> None:
    """Nom générique issu d'un dossier (« src », « .claude-commands »…) → préfixé par le nom du dépôt."""
    base = it.name.strip()
    core = _norm(base)
    if base.startswith("."):
        base = base.lstrip(".")
        it.name = base or it.name
    repo = it.source.repo.split("/")[-1]
    parts = [x for x in core.split("-") if x]
    if core in GENERIC_NAMES or (parts and all(x in GENERIC_NAMES for x in parts)):
        it.name = repo if core in GENERIC_NAMES else f"{repo} {' '.join(parts)}".replace("  ", " ")


def reject_reason(it: Item, cfg: QualityCfg) -> str | None:
    """Raison du rejet, ou None si l'élément est conservé."""
    if is_app_hook(it):
        return "app_code_hook"
    if is_skill_internal(it):
        return "skill_internal_mod"
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
    seen: set[tuple[str, str, str]] = set()
    for it in items:
        fix_name(it)
        r = reject_reason(it, cfg)
        if not r:
            # Même dépôt + même type + même résumé (souvent le README du dépôt repris par chaque sous-dossier) : un seul suffit.
            key = (it.type, it.source.repo, re.sub(r"\W+", "", it.summary_en.lower()))
            if key in seen:
                r = "same_repo_same_summary"
            seen.add(key)
        if r:
            why[r] += 1
        else:
            kept.append(it)
    return kept, why
