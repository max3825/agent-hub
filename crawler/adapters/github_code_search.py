"""`filename:SKILL.md` & co via l'API de recherche de code.

Contraintes : token OBLIGATOIRE, ~10 requêtes/min (throttling dans GitHubClient.search_code),
1000 résultats max par requête. Sans token, l'adapter se désactive en le signalant.
"""
from __future__ import annotations

from ..models import Candidate
from .base import Adapter


class GithubCodeSearchAdapter(Adapter):
    name = "github_code_search"
    origin = "github"

    def discover(self) -> list[Candidate]:
        cs = self.ctx.cfg.code_search
        if not cs.enabled:
            return []
        if not self.ctx.gh.token:
            self.log.warning("recherche de code désactivée : GITHUB_TOKEN requis")
            return []
        out: list[Candidate] = []
        for q in cs.queries:
            for repo in self.ctx.gh.search_code(q, pages=cs.max_pages):
                out.append(Candidate(repo=repo, origin="github", hint=f"code:{q}"))
        return out
