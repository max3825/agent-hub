"""Résumés : API Anthropic (Haiku) optionnelle, par lots, avec cache par contentHash et budget.

Sans `ANTHROPIC_API_KEY`, rien n'est appelé : on garde le résumé de repli déjà calculé par
normalize.py (description du frontmatter, sinon première phrase utile du README).
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Callable

import httpx

from .cache import Cache
from .models import Item

log = logging.getLogger("crawler.summarize")
API_URL = "https://api.anthropic.com/v1/messages"
DEFAULT_MODEL = "claude-haiku-5-5"

PROMPT = """Tu écris les résumés d'un annuaire d'extensions pour agents IA de code.
Pour CHAQUE élément ci-dessous, écris 1 à 2 phrases courtes (max 200 caractères) décrivant ce que fait l'élément, en français (« fr ») puis en anglais (« en »).
Pas de marketing, pas de formule d'introduction. Base-toi uniquement sur les informations fournies.
Réponds UNIQUEMENT avec un tableau JSON : [{"id": "...", "fr": "...", "en": "..."}, ...]

Éléments :
"""


def _brief(it: Item) -> dict:
    return {"id": it.contentHash, "type": it.type, "name": it.name, "description": it.summary_en[:400], "tags": it.tags[:6]}


def _parse(text: str) -> dict[str, tuple[str, str]]:
    m = re.search(r"\[.*\]", text, re.S)
    if not m:
        return {}
    try:
        rows = json.loads(m.group(0))
    except json.JSONDecodeError:
        return {}
    return {r["id"]: (str(r["fr"]).strip(), str(r["en"]).strip()) for r in rows if isinstance(r, dict) and {"id", "fr", "en"} <= r.keys() and r["fr"] and r["en"]}


def call_anthropic(batch: list[Item], key: str, model: str, client: httpx.Client) -> dict[str, tuple[str, str]]:
    body = {"model": model, "max_tokens": 2000, "messages": [{"role": "user", "content": PROMPT + json.dumps([_brief(i) for i in batch], ensure_ascii=False)}]}
    r = client.post(API_URL, json=body, headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"}, timeout=60)
    if r.status_code != 200:
        log.warning("API Anthropic HTTP %s : %s", r.status_code, r.text[:160])
        return {}
    text = "".join(b.get("text", "") for b in r.json().get("content", []) if b.get("type") == "text")
    return _parse(text)


def apply_summaries(
    items: list[Item], cache: Cache, *, max_per_run: int = 300, batch_size: int = 10, api_key: str | None = None,
    model: str | None = None, client: httpx.Client | None = None, caller: Callable[..., dict] = call_anthropic,
) -> dict[str, int]:
    """Applique les résumés en cache puis génère (dans la limite du budget) ceux qui manquent."""
    key = api_key if api_key is not None else os.environ.get("ANTHROPIC_API_KEY")
    model = model or os.environ.get("SUMMARY_MODEL") or DEFAULT_MODEL
    store = cache.load_map("summaries")
    stats = {"cached": 0, "generated": 0, "fallback": 0}

    todo: list[Item] = []
    seen_hash: set[str] = set()
    for it in items:
        hit = store.get(it.contentHash)
        if hit:
            it.summary, it.summary_en = hit["fr"], hit["en"]
            stats["cached"] += 1
        elif key and it.contentHash not in seen_hash:
            seen_hash.add(it.contentHash)
            todo.append(it)
        else:
            stats["fallback"] += 1

    todo = todo[: max(0, int(os.environ.get("MAX_SUMMARIES_PER_RUN", max_per_run)))]  # garde-fou de budget
    if todo and key:
        own = client or httpx.Client()
        for i in range(0, len(todo), batch_size):
            batch = todo[i : i + batch_size]
            try:
                got = caller(batch, key, model, own)
            except httpx.HTTPError as e:
                log.warning("lot de résumés échoué (%s) : repli", e)
                got = {}
            for it in batch:
                if it.contentHash in got:
                    fr, en = got[it.contentHash]
                    store[it.contentHash] = {"fr": fr, "en": en, "model": model}
                    stats["generated"] += 1
            cache.save_map("summaries", store)
        # Applique à tous les items partageant un hash généré
        for it in items:
            if (hit := store.get(it.contentHash)):
                it.summary, it.summary_en = hit["fr"], hit["en"]
        stats["fallback"] = sum(1 for it in items if it.contentHash not in store)
    return stats
