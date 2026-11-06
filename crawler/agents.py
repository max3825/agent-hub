"""Compatibilité agents : signaux explicites plutôt que simples mentions.

Chaque agent est associé à des CHEMINS caractéristiques (fichiers/dossiers de config propres à l'agent)
et à des MENTIONS dans les topics/description/README. On renvoie {agent: raison}. Les raisons « chemin »
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


def detect_agents(paths: list[str], texts: list[str], declared: list[str] | None = None, item_type: str = "skill") -> dict[str, str]:
    """{agent: raison}, claude-code toujours présent (les extensions indexées viennent de son écosystème)."""
    out: dict[str, str] = {}
    for a in declared or []:
        out[str(a)] = "déclaré dans le fichier"
    for agent, pats in PATH_SIGNALS.items():
        if agent not in out and any(rx.search(p) for p in paths for rx in pats):
            out[agent] = "fichiers spécifiques dans le dépôt"
    blob = "\n".join(texts)
    for agent, rx in MENTIONS.items():
        if agent not in out and rx.search(blob):
            out[agent] = "mentionné (topics, description ou README)"
    out.setdefault("claude-code", "écosystème de référence (par défaut)")
    # claude-code en premier, puis ordre stable
    return dict(sorted(out.items(), key=lambda kv: (kv[0] != "claude-code", kv[0])))
