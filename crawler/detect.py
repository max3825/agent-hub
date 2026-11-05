"""Détection du type d'un élément à partir de la liste des chemins d'un dépôt.

Règles (documentées dans le README) :
  - `SKILL.md`                         → skill (le dossier parent est l'élément)
  - `hooks/hooks.json` ou `hooks.json` → hook
  - dossier `hooks/` avec des scripts  → hook (si pas de hooks.json dans ce dossier)
  - tout le reste                      → mod, SEULEMENT si une règle de `sources.yaml` correspond
Aucun appel réseau ici : fonction pure, testée sur des listes de chemins.
"""
from __future__ import annotations

import posixpath
import re
from functools import lru_cache

from .config import DetectionCfg
from .models import Detected


def _expand_braces(pattern: str) -> list[str]:
    m = re.search(r"\{([^{}]+)\}", pattern)
    if not m:
        return [pattern]
    return [x for alt in m.group(1).split(",") for x in _expand_braces(pattern[: m.start()] + alt + pattern[m.end():])]


@lru_cache(maxsize=512)
def glob_to_regex(pattern: str) -> re.Pattern[str]:
    """Glob style gitignore minimal : `**/` = zéro ou plusieurs dossiers, `*` = hors `/`, `{a,b}` = alternatives."""
    alts = []
    for pat in _expand_braces(pattern):
        out, i = "", 0
        while i < len(pat):
            if pat.startswith("**/", i):
                out += "(?:.*/)?"; i += 3
            elif pat.startswith("**", i):
                out += ".*"; i += 2
            elif pat[i] == "*":
                out += "[^/]*"; i += 1
            elif pat[i] == "?":
                out += "[^/]"; i += 1
            else:
                out += re.escape(pat[i]); i += 1
        alts.append(out)
    return re.compile("^(?:" + "|".join(alts) + ")$")


def matches(path: str, pattern: str) -> bool:
    return bool(glob_to_regex(pattern).match(path))


def _skip(path: str) -> bool:
    parts = path.split("/")
    return any(p in {"node_modules", ".git", "vendor", "dist", "build", "__pycache__", "test", "tests", "fixtures", "examples-old"} for p in parts[:-1])


def detect(paths: list[str], cfg: DetectionCfg, repo_name: str = "") -> list[Detected]:
    paths = [p for p in paths if not _skip(p)]
    found: dict[tuple[str, str], Detected] = {}

    # 1) Skills
    for p in paths:
        if any(matches(p, g) for g in cfg.skill):
            d = posixpath.dirname(p)
            name = posixpath.basename(d) or repo_name or "skill"
            found[("skill", d)] = Detected(type="skill", name=name, path=d or ".", main_file=p, rule="skill")

    # 2) Hooks : hooks.json prioritaire
    hook_json_dirs: set[str] = set()
    for p in paths:
        if any(matches(p, g) for g in cfg.hook):
            d = posixpath.dirname(p)                      # …/hooks
            owner = posixpath.dirname(d) if posixpath.basename(d) == "hooks" else d
            name = posixpath.basename(owner) or repo_name or "hooks"
            hook_json_dirs.add(d)
            found[("hook", d)] = Detected(type="hook", name=name, path=d or ".", main_file=p, rule="hook")
    for p in paths:  # dossier hooks/ de scripts
        d = posixpath.dirname(p)
        if d in hook_json_dirs or posixpath.splitext(p)[1] not in cfg.hook_script_ext:
            continue
        if any(matches(d, g) for g in cfg.hook_dirs) and ("hook", d) not in found:
            owner = posixpath.dirname(d)
            found[("hook", d)] = Detected(type="hook", name=posixpath.basename(owner) or repo_name or "hooks", path=d, main_file=p, rule="hook-dir")

    # 3) Mods : uniquement via les règles configurées
    for rule in cfg.mods:
        hits = [p for p in paths if matches(p, rule.glob)]
        if not hits:
            continue
        if rule.scope == "dir":
            # `.claude-plugin/plugin.json` → le plugin est le dossier parent du dossier `.claude-plugin`
            for d in sorted({posixpath.dirname(p) for p in hits}):
                base = posixpath.dirname(d) if posixpath.basename(d) == ".claude-plugin" else d
                parent = posixpath.dirname(d) if posixpath.basename(d) in {"commands", "agents"} else base
                first = next(p for p in hits if posixpath.dirname(p) == d)
                key = ("mod", f"{rule.id}:{parent}")
                name = f"{posixpath.basename(parent) or repo_name}-{posixpath.basename(d)}" if rule.id in {"slash-command", "subagents"} else (posixpath.basename(base) or repo_name)
                found[key] = Detected(type="mod", name=name, path=d, main_file=first, rule=rule.id, tags=list(rule.tags))
        else:
            for p in hits:
                stem = posixpath.splitext(posixpath.basename(p))[0]
                found[("mod", f"{rule.id}:{p}")] = Detected(type="mod", name=stem, path=p, main_file=p, rule=rule.id, tags=list(rule.tags))
    return sorted(found.values(), key=lambda d: (d.type, d.path))
