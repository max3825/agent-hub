"""skills.sh — adapter OPTIONNEL et DÉFENSIF.

Aucune API publique documentée n'est supposée : on essaie quelques endpoints JSON plausibles, puis un
repli sur la page d'accueil (liens `github.com/owner/repo`). Toute erreur → liste vide (loggée).
"""
from __future__ import annotations

import re
from typing import Any

import httpx

from ..models import Candidate
from .base import Adapter

REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
GH_LINK = re.compile(r"github\.com/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)", re.I)


def extract_repos(payload: Any) -> list[str]:
    """Cherche récursivement des champs ressemblant à owner/repo dans un JSON de forme inconnue."""
    found: dict[str, None] = {}

    def walk(o: Any) -> None:
        if isinstance(o, dict):
            for k, v in o.items():
                if k in {"repo", "repository", "source", "github", "full_name", "topSource"} and isinstance(v, str):
                    v2 = v.replace("https://github.com/", "").strip("/")
                    if REPO_RE.match(v2):
                        found.setdefault(v2)
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
        elif isinstance(o, str):
            for m in GH_LINK.findall(o):
                found.setdefault(m.removesuffix(".git"))
    walk(payload)
    return list(found)


class SkillsShAdapter(Adapter):
    name = "skills_sh"
    origin = "skills.sh"
    ENDPOINTS = ("/api/skills", "/api/leaderboard", "/api/v1/skills")

    def discover(self) -> list[Candidate]:
        cfg = self.ctx.cfg.skills_sh
        if not cfg.enabled:
            return []
        base = cfg.base_url.rstrip("/")
        repos: list[str] = []
        with httpx.Client(timeout=cfg.timeout, follow_redirects=True, headers={"User-Agent": "agent-hub-crawler"}) as http:
            for ep in self.ENDPOINTS:
                try:
                    r = http.get(base + ep)
                    if r.status_code == 200 and "json" in r.headers.get("content-type", ""):
                        repos = extract_repos(r.json())
                        if repos:
                            break
                except (httpx.HTTPError, ValueError):
                    continue
            if not repos:  # repli : page HTML
                try:
                    r = http.get(base + "/")
                    if r.status_code == 200:
                        repos = [m.removesuffix(".git") for m in GH_LINK.findall(r.text)]
                        # liens internes du type href="/owner/repo" ou "/owner/repo/skill"
                        repos += [m for m in re.findall(r'href="/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)(?:/[^"]*)?"', r.text) if REPO_RE.match(m) and not m.startswith(("_next", "api/", "static/"))]
                except httpx.HTTPError as e:
                    self.log.info("skills.sh injoignable : %s", e)
        return [Candidate(repo=r, origin="skills.sh", hint="skills.sh") for r in dict.fromkeys(repos)]
