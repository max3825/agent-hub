"""Cache disque très simple (JSON) sous `.cache/` : ETag HTTP, métadonnées de dépôts, résumés."""
from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any

log = logging.getLogger("crawler.cache")


class Cache:
    def __init__(self, root: Path | str = ".cache"):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, ns: str, key: str) -> Path:
        h = hashlib.sha1(key.encode()).hexdigest()[:20]
        d = self.root / ns
        d.mkdir(parents=True, exist_ok=True)
        return d / f"{h}.json"

    def get(self, ns: str, key: str) -> Any | None:
        p = self._path(ns, key)
        try:
            return json.loads(p.read_text("utf-8")) if p.exists() else None
        except (OSError, json.JSONDecodeError):
            log.warning("cache corrompu ignoré : %s", p)
            return None

    def set(self, ns: str, key: str, value: Any) -> None:
        p = self._path(ns, key)
        tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps(value, ensure_ascii=False), "utf-8")
        tmp.replace(p)

    # Fichier unique pour les résumés (clé = contentHash)
    def load_map(self, name: str) -> dict[str, Any]:
        p = self.root / f"{name}.json"
        try:
            return json.loads(p.read_text("utf-8")) if p.exists() else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def save_map(self, name: str, data: dict[str, Any]) -> None:
        (self.root / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False), "utf-8")
