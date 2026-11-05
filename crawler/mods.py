"""Score de confiance des mods (0..1). Il n'existe pas de format standard : on combine la force de la règle
et des validations de contenu. Les détections sous `min_confidence` sont écartées ; entre ce seuil et 0,7,
l'UI affiche « détection incertaine »."""
from __future__ import annotations

import json
import re

from .models import Detected

BASE = {"plugin": 0.85, "mcp-plugin": 0.8, "slash-command": 0.55, "subagents": 0.55, "output-style": 0.55,
        "statusline": 0.45, "statusline-dir": 0.45, "theme": 0.4, "keybindings": 0.4}


def _json(text: str):
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        return None


def score_mod(d: Detected, text: str) -> tuple[float, list[str]]:
    """Retourne (confiance, raisons). `text` = contenu du fichier principal."""
    score, why = BASE.get(d.rule, 0.4), []
    rule = d.rule
    if rule in {"slash-command", "subagents", "output-style"}:
        has_fm = text.lstrip().startswith("---") and re.search(r"^description:\s*\S", text, re.M)
        if has_fm:
            score += 0.3; why.append("frontmatter avec description")
        if len(text.strip()) < 40:
            score -= 0.3; why.append("fichier quasi vide")
        if rule == "subagents" and re.search(r"^name:\s*\S", text, re.M):
            score += 0.1; why.append("nom d'agent déclaré")
    elif rule == "plugin":
        j = _json(text)
        if isinstance(j, dict) and j.get("name"):
            score += 0.1; why.append("plugin.json valide")
        else:
            score -= 0.4; why.append("plugin.json invalide")
    elif rule == "mcp-plugin":
        j = _json(text)
        if isinstance(j, dict) and ("mcpServers" in j or any(isinstance(v, dict) and "command" in v for v in j.values())):
            score += 0.15; why.append("serveurs MCP déclarés")
        else:
            score -= 0.4; why.append("pas de serveur MCP")
    elif rule in {"statusline", "statusline-dir"}:
        if re.search(r"statusLine|status[_-]?line|\$\(\s*cat\b|jq\s+-r", text, re.I):
            score += 0.3; why.append("référence explicite à la status line")
        if text.startswith("#!"):
            score += 0.1; why.append("script exécutable")
    elif rule == "theme":
        j = _json(text)
        if isinstance(j, dict) and any(k in j for k in ("colors", "theme", "palette", "name")):
            score += 0.3; why.append("JSON de thème plausible")
        else:
            score -= 0.2; why.append("JSON sans clé de thème")
    elif rule == "keybindings":
        j = _json(text)
        if isinstance(j, (dict, list)) and ("bindings" in j if isinstance(j, dict) else True):
            score += 0.3; why.append("JSON de raccourcis plausible")
        else:
            score -= 0.2; why.append("JSON sans raccourcis")
    return max(0.0, min(1.0, round(score, 2))), why
