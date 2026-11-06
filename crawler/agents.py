"""Compatibilité agents : signaux explicites plutôt que simples mentions.

Chaque agent est associé à des CHEMINS caractéristiques (fichiers/dossiers de config propres à l'agent)
et à des MENTIONS dans les topics et la description du dépôt (le README est ignoré : trop de faux positifs, ex. listes de « compatibilités »). On renvoie {agent: raison}. Les raisons « chemin »
sont plus fiables que « mention » : l'UI les distingue.
"""
from __future__ import annotations

import re

PATH_SIGNALS: dict[str, list[re.Pattern[str]]] = {
    "claude-code": [re.compile(p) for p in (r"(^|/)\.claude-plugin/", r"(^|/)\.claude/", r"(^|/)CLAUDE\.md$", r"(^|/)hooks/hooks\.json$")],
    "codex": [re.compile(p) for p in (r"(^|/)AGENTS\.md$", r"(^|/)\.codex/", r"(^|/)codex[-_]")],
    "cursor": [re.compile(p) for p in (r"(^|/)\.cursor/", r"(^|/)\.cursorrules$", r"\.mdc$")],
    "gemini-cli": [re.compile(p) for p in (r"(^|/)GEMINI\.md$", r"(^|/)gemini-extension\.json$", r"(^|/)\.gemini/")],
    "windsurf": [re.compile(p) for p in (r"(^|/)\.windsurf/", r"(^|/)\.windsurfrules$")],
    "github-copilot": [re.compile(p) for p in (r"(^|/)\.github/copilot-instructions\.md$", r"(^|/)\.github/(prompts|instructions|agents|chatmodes|skills)/", r"\.(prompt|instructions|chatmode)\.md$")],
}
MENTIONS = {
    "claude-code": re.compile(r"\bclaude[- ]code\b", re.I), "codex": re.compile(r"\bcodex\b", re.I),
    "cursor": re.compile(r"\bcursor\b", re.I), "gemini-cli": re.compile(r"\bgemini[- ]cli\b", re.I),
    "windsurf": re.compile(r"\bwindsurf\b", re.I), "github-copilot": re.compile(r"\b(github[- ]copilot|copilot (chat|cli|agent))\b", re.I),
}


# Fichiers d'INSTRUCTIONS (guide de contribution du dépôt, p. ex. AGENTS.md à la racine) : ils ne prouvent pas
# qu'un élément précis fonctionne avec l'agent. Ils ne comptent que dans le dossier de l'élément lui-même.
INSTRUCTION_FILE = re.compile(r"(^|/)(AGENTS|CLAUDE|GEMINI)\.md$|(^|/)\.cursorrules$|(^|/)\.windsurfrules$|copilot-instructions\.md$")


def _in_scope(p: str, item_path: str) -> bool:
    """Un fichier/dossier de config compte pour l'élément s'il est dans son dossier, ou dans un dossier ancêtre
    (config au niveau du dépôt ou du sous-projet, p. ex. `.codex/` à la racine)."""
    item = "" if item_path in {"", "."} else item_path.strip("/")
    if item and (p == item or p.startswith(item + "/")):
        return True
    if not item:
        return True
    # config située dans un ancêtre de l'élément : le dossier parent de ce fichier de config doit être un préfixe du chemin
    first = p.split("/")
    for i, seg in enumerate(first):
        if seg.startswith(".") or seg.endswith(("-plugin.json", "-extension.json")):
            parent = "/".join(first[:i])
            return parent == "" or item == parent or item.startswith(parent + "/")
    return False


def detect_agents(paths: list[str], texts: list[str], declared: list[str] | None = None, item_type: str = "skill", item_path: str | None = None) -> dict[str, str]:
    """{agent: raison}, claude-code toujours présent (les extensions indexées viennent de son écosystème).

    Avec `item_path`, les signaux de chemin sont limités au périmètre de l'élément (voir `_in_scope`) ;
    sans lui (tests, usage historique), tout le dépôt est considéré."""
    out: dict[str, str] = {}
    for a in declared or []:
        out[str(a)] = "déclaré dans le fichier"

    def hit(p: str, rx: re.Pattern[str]) -> bool:
        if not rx.search(p):
            return False
        if item_path is None:
            return True
        item = "" if item_path in {"", "."} else item_path.strip("/")
        if INSTRUCTION_FILE.search(p):
            return bool(item) and (p.startswith(item + "/") or p == item)
        return _in_scope(p, item_path)

    for agent, pats in PATH_SIGNALS.items():
        if agent not in out and any(hit(p, rx) for p in paths for rx in pats):
            out[agent] = "fichiers spécifiques dans le dépôt"
    blob = "\n".join(texts)
    for agent, rx in MENTIONS.items():
        if agent not in out and rx.search(blob):
            out[agent] = "mentionné (topics, description ou README)"
    out.setdefault("claude-code", "écosystème de référence (par défaut)")
    # claude-code en premier, puis ordre stable
    return dict(sorted(out.items(), key=lambda kv: (kv[0] != "claude-code", kv[0])))
