"""Scan de sécurité HEURISTIQUE (regex). Ce n'est PAS un audit : faux positifs et faux négatifs attendus.

Chaque règle : (id, sévérité, regex, message). Le niveau de risque est dérivé de la pire sévérité trouvée.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from .models import Risk


@dataclass(frozen=True)
class Rule:
    id: str
    severity: str  # "high" | "medium"
    pattern: re.Pattern[str]
    message: str


def _r(i: str, sev: str, pat: str, msg: str) -> Rule:
    return Rule(i, sev, re.compile(pat, re.I | re.M), msg)


RULES: list[Rule] = [
    _r("curl-pipe-sh", "high", r"\b(?:curl|wget)\b[^\n|;]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b", "`curl|sh` pattern: remote code execution"),
    _r("base64-exec", "high", r"base64\s+(?:-d|--decode)[^\n]*\|\s*(?:ba|z)?sh\b|\beval\b[^\n]*base64|base64\s+(?:-d|--decode)\b[^\n]*\beval\b", "Base64-decoded payload piped to shell"),
    _r("exfil-upload", "high", r"\bcurl\b[^\n]*(?:-d|--data(?:-binary|-raw|-urlencode)?|-F|--form|-T|--upload-file)\s+[\"']?@[^\s\"']+|\bwget\b[^\n]*--post-file", "Network exfiltration: uploads a local file with curl/wget"),
    _r("secrets-and-network", "high", r"(?:~|\$HOME)/\.(?:ssh|aws|gnupg|netrc)[^\n]*\b(?:curl|wget|nc)\b|\b(?:curl|wget|nc)\b[^\n]*(?:~|\$HOME)/\.(?:ssh|aws|gnupg|netrc)", "Reads credential files and sends them over the network"),
    _r("eval", "medium", r"(?<![\w.-])eval\s*[\(\"'$ ]", "`eval` of a dynamic string"),
    _r("rm-rf", "medium", r"\brm\s+(?:-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|--recursive\s+--force|-rf|-fr)\b", "Contains literal `rm -rf`"),
    _r("read-secrets", "medium", r"(?:~|\$HOME)/\.(?:ssh|aws|gnupg|netrc|docker/config\.json)|(?<![\w/])\.env(?:\.[\w]+)?\b|id_rsa|credentials\b", "References credential/secret paths (`~/.ssh`, `.env`, …)"),
    _r("secret-env", "medium", r"\$\{?[A-Z0-9_]*(?:TOKEN|SECRET|API_KEY|PASSWORD|WEBHOOK_URL)[A-Z0-9_]*\}?", "Reads secret-looking environment variables"),
    _r("network", "medium", r"\b(?:curl|wget)\b\s+[^\n]*https?://", "Network call to an external host via `curl`/`wget`"),
    _r("base64", "medium", r"\bbase64\s+(?:-d|--decode)\b|\batob\(|b64decode", "Decodes base64 (possibly hiding a payload)"),
    _r("chmod-777", "medium", r"\bchmod\s+(?:-R\s+)?(?:777|a\+rwx)\b", "World-writable permissions (`chmod 777`)"),
    _r("sudo", "medium", r"(?<![\w-])sudo\s+\S", "Uses `sudo`"),
]


def scan_text(text: str) -> list[tuple[str, str, str]]:
    """Retourne [(rule_id, severity, message)] sans doublons."""
    seen, out = set(), []
    for rule in RULES:
        if rule.id not in seen and rule.pattern.search(text):
            seen.add(rule.id)
            out.append((rule.id, rule.severity, rule.message))
    return out


def assess(texts: list[str], item_type: str) -> Risk:
    """Hooks et mods : low/medium/high. Skills : seules les alertes graves comptent (docs = beaucoup de faux positifs)."""
    hits: dict[str, tuple[str, str]] = {}
    for t in texts:
        for rid, sev, msg in scan_text(t):
            if item_type == "skill" and sev != "high":
                continue
            hits.setdefault(rid, (sev, msg))
    flags = [m for _, m in hits.values()]
    if any(s == "high" for s, _ in hits.values()):
        # Un skill n'exécute pas de shell tout seul : on plafonne à « medium ».
        return Risk(level="medium" if item_type == "skill" else "high", flags=flags)
    if hits:
        return Risk(level="medium", flags=flags)
    return Risk(level="n/a" if item_type == "skill" else "low", flags=[])
