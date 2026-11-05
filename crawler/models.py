"""Modèles pydantic : schéma unique `Item` (data/items.json) et structures internes."""
from __future__ import annotations

import hashlib
from typing import Literal

from pydantic import BaseModel, Field

ItemType = Literal["skill", "hook", "mod"]
RiskLevel = Literal["low", "medium", "high", "n/a"]


class Source(BaseModel):
    repo: str
    url: str
    path: str
    origin: str  # github | skills.sh | marketplace | awesome


class Risk(BaseModel):
    level: RiskLevel = "n/a"
    flags: list[str] = Field(default_factory=list)


class Item(BaseModel):
    id: str
    type: ItemType
    name: str
    summary: str
    summary_en: str
    tags: list[str] = Field(default_factory=list)
    source: Source
    stars: int = 0
    license: str | None = None
    lastCommit: str
    firstSeen: str
    agents: list[str] = Field(default_factory=lambda: ["claude-code"])
    install: str | None = None
    contentHash: str
    risk: Risk = Field(default_factory=Risk)
    # Extension optionnelle (affichée dans le panneau de détail des hooks).
    hookCommands: list[str] | None = None


class RepoMeta(BaseModel):
    full_name: str
    stars: int = 0
    archived: bool = False
    fork: bool = False
    pushed_at: str = ""
    license: str | None = None
    default_branch: str = "main"
    description: str | None = None
    topics: list[str] = Field(default_factory=list)


class Candidate(BaseModel):
    """Un dépôt à analyser, avec les sources qui l'ont mentionné."""
    repo: str
    origin: str = "github"
    hint: str | None = None


class Detected(BaseModel):
    """Un élément repéré dans l'arbre d'un dépôt (avant lecture du contenu)."""
    type: ItemType
    name: str
    path: str          # dossier (skill/hook/mod en dossier) ou fichier
    main_file: str     # fichier principal à lire (SKILL.md, hooks.json, …)
    rule: str = ""     # id de la règle (mods) ou "skill"/"hook"
    tags: list[str] = Field(default_factory=list)
    plugin: str | None = None
    marketplace: str | None = None


def stable_id(repo: str, path: str) -> str:
    return hashlib.sha256(f"{repo.lower()}:{path}".encode()).hexdigest()[:16]


def content_hash(*parts: str) -> str:
    h = hashlib.sha256()
    for p in parts:
        # Normalisation : fins de ligne et espaces de fin de ligne ne changent pas l'empreinte.
        h.update("\n".join(line.rstrip() for line in p.replace("\r\n", "\n").split("\n")).strip().encode())
        h.update(b"\x00")
    return h.hexdigest()[:16]
