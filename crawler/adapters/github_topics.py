"""Recherche de dépôts par topics GitHub (+ dépôts de départ de sources.yaml)."""
from __future__ import annotations

from ..models import Candidate
from .base import Adapter


class GithubTopicsAdapter(Adapter):
    name = "github_topics"
    origin = "github"

    def discover(self) -> list[Candidate]:
        g = self.ctx.cfg.github
        out = [Candidate(repo=r, origin="github", hint="seed") for r in self.ctx.cfg.seed_repos]
        for topic in g.topics:
            q = f"topic:{topic} stars:>={g.min_stars} archived:false fork:false"
            try:
                repos = self.ctx.gh.search_repos(q, pages=g.max_topic_pages)
            except Exception as e:  # une erreur sur un topic n'arrête pas les autres
                self.log.warning("topic %s ignoré (%s)", topic, e)
                continue
            out += [Candidate(repo=r.full_name, origin="github", hint=f"topic:{topic}") for r in repos]
        return out
