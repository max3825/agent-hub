"""Sorties : data/items.json, shards de recherche, détails à la demande, modèle sémantique, stats.

Format identique à celui de web/scripts/prepare-data.mjs (mode démo) :
  index/manifest.json         compteurs, date, liste des shards, drapeaux (semantic, details)
  index/items-<type>-<n>.json shards triés par étoiles (sans `preview`/`outline`, trop lourds pour l'index)
  index/detail/<id[:2]>.json  {id: {preview, outline}} chargé à l'ouverture d'une fiche
  index/semantic.json         modèle LSA (voir semantic.py)  — absent si corpus trop petit / numpy manquant
  index/stats.json            statistiques de santé du crawl
"""
from __future__ import annotations

import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path

from .models import Item

log = logging.getLogger("crawler.outputs")
SHARD_SIZE = 2000
DETAIL_KEYS = ("preview", "outline")


def write_outputs(items: list[Item], data_dir: Path, index_dir: Path, now: datetime | None = None, stats: dict | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    data_dir.mkdir(parents=True, exist_ok=True)
    dumped = [i.model_dump(mode="json", exclude_none=True) for i in items]
    (data_dir / "items.json").write_text(json.dumps(dumped, ensure_ascii=False, indent=1), "utf-8")

    counts = {t: sum(1 for i in items if i.type == t) for t in ("skill", "hook", "mod")}
    generated = now.isoformat().replace("+00:00", "Z")
    risk = {lvl: sum(1 for i in items if i.risk.level == lvl) for lvl in ("low", "medium", "high", "n/a")}
    meta = {"generatedAt": generated, "total": len(items), "counts": counts, "risk": risk}
    (data_dir / "meta.json").write_text(json.dumps(meta, indent=1), "utf-8")

    # Statistiques de santé (page « Santé du crawl »)
    health = {"generatedAt": generated, "total": len(items), "counts": counts, "risk": risk, **{k: v for k, v in (stats or {}).items() if k != "meta"}}
    (data_dir / "stats.json").write_text(json.dumps(health, ensure_ascii=False, indent=1, default=str), "utf-8")

    # Modèle sémantique (optionnel)
    semantic = False
    try:
        from .semantic import build_model
        model = build_model(items)
        if model:
            (data_dir / "semantic.json").write_text(json.dumps(model, separators=(",", ":")), "utf-8")
            semantic = True
        elif (data_dir / "semantic.json").exists():
            (data_dir / "semantic.json").unlink()
    except ImportError:
        log.warning("numpy absent : recherche sémantique non générée")

    if index_dir.exists():
        shutil.rmtree(index_dir)
    (index_dir / "detail").mkdir(parents=True)
    shards, details = [], {}
    for d in dumped:
        extra = {k: d.pop(k) for k in DETAIL_KEYS if k in d}
        if extra:
            details.setdefault(d["id"][:2], {})[d["id"]] = extra
    for t in ("skill", "hook", "mod"):
        group = sorted((d for d in dumped if d["type"] == t), key=lambda d: -d["stars"])
        for n in range(0, len(group), SHARD_SIZE):
            chunk = group[n : n + SHARD_SIZE]
            name = f"items-{t}-{n // SHARD_SIZE}.json"
            (index_dir / name).write_text(json.dumps(chunk, ensure_ascii=False, separators=(",", ":")), "utf-8")
            shards.append({"file": name, "type": t, "count": len(chunk)})
    for bucket, content in details.items():
        (index_dir / "detail" / f"{bucket}.json").write_text(json.dumps(content, ensure_ascii=False, separators=(",", ":")), "utf-8")
    if semantic:
        shutil.copy(data_dir / "semantic.json", index_dir / "semantic.json")
    shutil.copy(data_dir / "stats.json", index_dir / "stats.json")
    (index_dir / "manifest.json").write_text(json.dumps({
        "version": 2, "generatedAt": generated, "total": len(items), "counts": counts, "shards": shards,
        "demo": False, "semantic": semantic, "details": bool(details), "stats": True,
    }), "utf-8")
    return meta
