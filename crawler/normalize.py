"""Normalisation : texte brut (SKILL.md, hooks.json…) → `Item` du schéma unique.

On ne copie JAMAIS le contenu complet : uniquement un résumé court, des tags et des métadonnées.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

import yaml

from .models import Detected, Item, RepoMeta, Risk, Source, content_hash, stable_id
from .security import assess

_FM = re.compile(r"\A﻿?---\s*\n(.*?)\n---\s*(?:\n|\Z)", re.S)


def parse_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    m = _FM.match(text)
    if not m:
        return {}, text
    try:
        data = yaml.safe_load(m.group(1))
    except yaml.YAMLError:
        data = None
    return (data if isinstance(data, dict) else {}), text[m.end():]


def clean_text(s: str, max_len: int = 220) -> str:
    s = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", s)      # liens/images markdown → texte
    s = re.sub(r"[`*_>#]+", "", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) <= max_len:
        return s
    cut = s[:max_len]
    m = list(re.finditer(r"[.!?](?:\s|$)", cut))
    return (cut[: m[-1].end()].strip() if m and m[-1].end() > 60 else cut.rsplit(" ", 1)[0] + "…")


def first_useful_sentence(markdown: str, max_len: int = 220) -> str:
    """Premier paragraphe « utile » : ignore titres, badges, HTML, tableaux, blocs de code, liens seuls."""
    body = re.sub(r"```.*?```", "", markdown, flags=re.S)
    for para in re.split(r"\n\s*\n", body):
        lines = [l.strip() for l in para.strip().splitlines() if l.strip()]
        if not lines or lines[0].startswith(("#", "|", "<", "![", "[![", "---", "===", ">", "- [", "* [")):
            continue
        text = clean_text(" ".join(lines), max_len * 2)
        if len(text) < 25 or not re.search(r"[A-Za-zÀ-ÿ]{3}", text):
            continue
        sentences = re.split(r"(?<=[.!?])\s+", text)
        out = sentences[0]
        if len(out) < 80 and len(sentences) > 1:  # 1 à 2 phrases
            out += " " + sentences[1]
        return clean_text(out, max_len)
    return ""


def _norm_license(lic: str | None) -> str | None:
    return None if not lic or lic.upper() in {"NOASSERTION", "OTHER"} else lic


def extract_hook_commands(hooks_json: str) -> list[str]:
    try:
        data = json.loads(hooks_json)
    except json.JSONDecodeError:
        return []
    cmds: list[str] = []

    def walk(o: Any) -> None:
        if isinstance(o, dict):
            if isinstance(o.get("command"), str):
                cmds.append(o["command"])
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(data)
    return list(dict.fromkeys(cmds))


def build_install(d: Detected, repo: str) -> str | None:
    if d.type == "skill":
        return f"npx skills add {repo} --skill {d.name}"
    if d.marketplace and d.plugin:
        return f"/plugin marketplace add {repo}\n/plugin install {d.plugin}@{d.marketplace}"
    return None


def build_item(
    d: Detected, meta: RepoMeta, main_text: str, extra_texts: list[str], *, origin: str,
    readme: str = "", plugin_description: str = "", first_seen: str | None = None, agents: list[str] | None = None,
    now: datetime | None = None,
) -> Item:
    now = now or datetime.now(timezone.utc)
    fm, body = parse_frontmatter(main_text) if d.main_file.lower().endswith(".md") else ({}, main_text)
    name = str(fm.get("name") or d.name).strip() or d.name

    desc = ""
    if isinstance(fm.get("description"), str):
        desc = clean_text(fm["description"])
    if not desc and d.main_file.endswith(".json"):
        try:
            j = json.loads(main_text)
            if isinstance(j, dict) and isinstance(j.get("description"), str):
                desc = clean_text(j["description"])
        except json.JSONDecodeError:
            pass
    desc = desc or clean_text(plugin_description) or first_useful_sentence(body if d.main_file.endswith(".md") else "") \
        or first_useful_sentence(readme) or clean_text(meta.description or "") or f"{d.type.capitalize()} « {name} » ({meta.full_name})."

    tags = list(dict.fromkeys([*d.tags, *[str(t).lower() for t in (fm.get("tags") or []) if isinstance(t, (str, int))], *meta.topics[:4]]))[:8]
    commands = extract_hook_commands(main_text) if d.type == "hook" and d.main_file.endswith(".json") else None
    # Un mod en Markdown (commande slash, sous-agent…) est de la prose, pas du code exécutable :
    # on lui applique la même sévérité réduite qu'aux skills pour éviter les faux positifs.
    scan_kind = "skill" if d.type == "mod" and d.main_file.lower().endswith(".md") else d.type
    risk: Risk = assess([main_text, *extra_texts], scan_kind)
    # La commande d'un hook est déjà dans main_text ; les scripts référencés sont dans extra_texts.

    ref = meta.default_branch
    kind = "blob" if d.path == d.main_file else "tree"
    url = f"https://github.com/{meta.full_name}/{kind}/{ref}/{d.path}" if d.path not in {"", "."} else f"https://github.com/{meta.full_name}"
    allowed = fm.get("allowed-agents") or fm.get("agents")
    agent_list = agents or ([str(a) for a in allowed] if isinstance(allowed, list) else ["claude-code"])
    iso = lambda dt: dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")  # noqa: E731

    return Item(
        id=stable_id(meta.full_name, d.path), type=d.type, name=name, summary=desc, summary_en=desc, tags=tags,
        source=Source(repo=meta.full_name, url=url, path=d.path, origin=origin),
        stars=meta.stars, license=_norm_license(meta.license), lastCommit=meta.pushed_at or iso(now),
        firstSeen=first_seen or iso(now), agents=agent_list, install=build_install(d, meta.full_name),
        contentHash=content_hash(d.type, name, main_text), risk=risk, hookCommands=commands,
    )


_AGENT_HINTS = {
    "codex": re.compile(r"\bcodex\b", re.I), "cursor": re.compile(r"\bcursor\b", re.I),
    "gemini-cli": re.compile(r"\bgemini[- ]cli\b", re.I), "windsurf": re.compile(r"\bwindsurf\b", re.I),
}


def infer_agents(*texts: str) -> list[str]:
    """Claude Code par défaut ; ajoute les autres agents explicitement cités (topics, description, README)."""
    blob = "\n".join(texts)
    return ["claude-code", *[a for a, rx in _AGENT_HINTS.items() if rx.search(blob)]]
