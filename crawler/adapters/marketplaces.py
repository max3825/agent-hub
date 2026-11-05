"""Marketplaces de plugins : lit `.claude-plugin/marketplace.json` et descend dans les plugins référencés.

- source relative (`./plugins/foo`) → analysé dans le même dépôt (voir pipeline.plugin_roots)
- source distante (`{"source":"github","repo":"o/r"}`) → nouveau dépôt candidat
"""
from __future__ import annotations

import json
from typing import Any

from ..models import Candidate
from .base import Adapter

MARKETPLACE_PATH = ".claude-plugin/marketplace.json"


def parse_marketplace(text: str) -> dict[str, Any]:
    """Retourne {name, plugins:[{name, description, path|None, repo|None}]} (tolérant aux variantes)."""
    data = json.loads(text)
    plugins = []
    for p in data.get("plugins", []) if isinstance(data, dict) else []:
        if not isinstance(p, dict) or not p.get("name"):
            continue
        src, path, repo = p.get("source"), None, None
        if isinstance(src, str):
            if src.startswith(("./", "/")) or "/" not in src.strip("."):
                path = src.removeprefix("./").strip("/") or "."
            elif src.count("/") == 1 and not src.startswith("http"):
                repo = src
        elif isinstance(src, dict):
            kind = src.get("source")
            if kind == "github" and src.get("repo"):
                repo = src["repo"]
            elif kind in ("url", "git") and "github.com/" in str(src.get("url", "")):
                repo = str(src["url"]).split("github.com/", 1)[1].removesuffix(".git").strip("/")
        plugins.append({"name": p["name"], "description": p.get("description", ""), "path": path, "repo": repo})
    return {"name": data.get("name", "") if isinstance(data, dict) else "", "plugins": plugins}


class MarketplacesAdapter(Adapter):
    name = "marketplaces"
    origin = "marketplace"

    def discover(self) -> list[Candidate]:
        out: list[Candidate] = []
        for repo in self.ctx.cfg.marketplaces:
            out.append(Candidate(repo=repo, origin="marketplace", hint="marketplace"))
            meta = self.ctx.gh.repo(repo)
            if not meta:
                continue
            text = self.ctx.gh.raw(repo, meta.default_branch, MARKETPLACE_PATH)
            if not text:
                continue
            try:
                mk = parse_marketplace(text)
            except (json.JSONDecodeError, AttributeError) as e:
                self.log.warning("%s : marketplace.json illisible (%s)", repo, e)
                continue
            out += [Candidate(repo=p["repo"], origin="marketplace", hint=f"plugin:{p['name']}") for p in mk["plugins"] if p["repo"]]
        return out
