"""Listes « awesome » : extrait les dépôts GitHub cités dans les README markdown."""
from __future__ import annotations

import re

from ..models import Candidate
from .base import Adapter

LINK = re.compile(r"https?://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)(?:/(?:tree|blob)/[^\s)\]]*)?", re.I)
IGNORED_OWNERS = {"sponsors", "topics", "orgs", "features", "marketplace", "settings", "apps", "login", "about", "pricing", "collections", "readme"}


def parse_awesome(markdown: str, self_repo: str = "") -> list[str]:
    seen: dict[str, None] = {}
    for owner, name in LINK.findall(markdown):
        name = name.removesuffix(".git").rstrip(".")
        full = f"{owner}/{name}"
        if owner.lower() in IGNORED_OWNERS or not name or full.lower() == self_repo.lower():
            continue
        seen.setdefault(full)
    return list(seen)


class AwesomeListsAdapter(Adapter):
    name = "awesome_lists"
    origin = "awesome"

    def discover(self) -> list[Candidate]:
        out: list[Candidate] = []
        for lst in self.ctx.cfg.awesome_lists:
            meta = self.ctx.gh.repo(lst.repo)
            branch = meta.default_branch if meta else "main"
            text = self.ctx.gh.raw(lst.repo, branch, lst.path, max_bytes=2_000_000)
            if not text:
                self.log.warning("%s/%s introuvable", lst.repo, lst.path)
                continue
            out += [Candidate(repo=r, origin="awesome", hint=f"awesome:{lst.repo}") for r in parse_awesome(text, lst.repo)]
        return out
