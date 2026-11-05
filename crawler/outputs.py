"""Sorties : data/items.json, shards de recherche (même format que web/scripts/prepare-data.mjs), data/meta.json."""
from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from .models import Item

SHARD_SIZE = 2000


def write_outputs(items: list[Item], data_dir: Path, index_dir: Path, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    data_dir.mkdir(parents=True, exist_ok=True)
    dumped = [i.model_dump(mode="json", exclude_none=True) for i in items]
    (data_dir / "items.json").write_text(json.dumps(dumped, ensure_ascii=False, indent=1), "utf-8")

    counts = {t: sum(1 for i in items if i.type == t) for t in ("skill", "hook", "mod")}
    generated = now.isoformat().replace("+00:00", "Z")
    meta = {"generatedAt": generated, "total": len(items), "counts": counts,
            "risk": {lvl: sum(1 for i in items if i.risk.level == lvl) for lvl in ("low", "medium", "high", "n/a")}}
    (data_dir / "meta.json").write_text(json.dumps(meta, indent=1), "utf-8")

    if index_dir.exists():
        shutil.rmtree(index_dir)
    index_dir.mkdir(parents=True)
    shards = []
    for t in ("skill", "hook", "mod"):
        group = sorted((d for d in dumped if d["type"] == t), key=lambda d: -d["stars"])
        for n in range(0, len(group), SHARD_SIZE):
            chunk = group[n : n + SHARD_SIZE]
            name = f"items-{t}-{n // SHARD_SIZE}.json"
            (index_dir / name).write_text(json.dumps(chunk, ensure_ascii=False, separators=(",", ":")), "utf-8")
            shards.append({"file": name, "type": t, "count": len(chunk)})
    (index_dir / "manifest.json").write_text(json.dumps({"version": 1, "generatedAt": generated, "total": len(items), "counts": counts, "shards": shards, "demo": False}), "utf-8")
    return meta
