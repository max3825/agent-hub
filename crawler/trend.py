"""Historique d'étoiles (un instantané par jour et par élément, gardé dans `.cache/`) → tendances.

`d7` / `d30` = gain d'étoiles par rapport à l'instantané le plus proche (et antérieur à) il y a 7 / 30 jours.
Tant que l'historique est plus court, on se rabat sur le plus ancien instantané (≥ 1 jour) : le chiffre
est alors un gain « depuis le premier relevé », ce qui reste un bon signal de tendance."""
from __future__ import annotations

from datetime import date, timedelta

KEEP_DAYS = 60


def update_history(hist: dict[str, dict[str, int]], item_id: str, stars: int, today: date) -> None:
    h = hist.setdefault(item_id, {})
    h[today.isoformat()] = stars
    cutoff = (today - timedelta(days=KEEP_DAYS)).isoformat()
    for d in [d for d in h if d < cutoff]:
        del h[d]


def compute_trend(h: dict[str, int], stars: int, today: date) -> dict[str, int] | None:
    past = {date.fromisoformat(d): s for d, s in h.items() if date.fromisoformat(d) < today}
    if not past:
        return None

    def baseline(days: int) -> int:
        target = today - timedelta(days=days)
        older = [d for d in past if d <= target]
        d = max(older) if older else min(past)   # sinon : plus ancien relevé disponible
        return past[d]

    return {"d7": stars - baseline(7), "d30": stars - baseline(30)}
