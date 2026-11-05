from datetime import date

from crawler.models import Item, Source
from crawler.semantic import build_model, rank, tokenize
from crawler.trend import compute_trend, update_history

T = date(2026, 11, 10)


def test_trend_baselines():
    h = {"2026-10-01": 100, "2026-11-02": 140, "2026-11-09": 190}
    assert compute_trend(h, 200, T) == {"d7": 60, "d30": 100}    # d7 : relevé du 02/11 (≤ J-7) ; d30 : relevé du 01/10
    assert compute_trend({}, 5, T) is None
    assert compute_trend({"2026-11-10": 5}, 5, T) is None         # relevé du jour même ignoré
    assert compute_trend({"2026-11-09": 90}, 100, T) == {"d7": 10, "d30": 10}   # historique court → plus ancien relevé


def test_history_pruned():
    hist = {}
    update_history(hist, "a", 1, date(2026, 1, 1))
    update_history(hist, "a", 2, T)
    assert list(hist["a"]) == ["2026-11-10"]


def mk(i, name, tags, fr, en):
    return Item(id=f"id{i:02d}", type="skill", name=name, summary=fr, summary_en=en, tags=tags, source=Source(repo="o/r", url="u", path=name, origin="github"),
                lastCommit="2026-01-01T00:00:00Z", firstSeen="2026-01-01T00:00:00Z", contentHash=f"h{i}")


def corpus():
    docs = []
    for i in range(10):
        docs.append(mk(i, f"sql-tool-{i}", ["database", "sql"], "Optimise les requêtes SQL lentes et les index de base de données.", "Optimizes slow SQL queries, database indexes and query plans."))
    for i in range(10, 20):
        docs.append(mk(i, f"ui-review-{i}", ["design", "frontend"], "Relit une interface React : contrastes, espacements, accessibilité.", "Reviews a React interface: contrast, spacing and accessibility."))
    return docs


def test_tokenize_strips_accents_and_stopwords():
    assert tokenize("Accessibilité des Interfaces, the SQL!") == ["accessibilite", "interfaces", "sql"]


def test_semantic_ranks_by_meaning_across_languages():
    m = build_model(corpus())
    assert m and m["k"] >= 6
    top = [i for i, _ in rank(m, "database query performance", 5)]
    assert all(int(i[2:]) < 10 for i in top)                       # requête anglaise → entrées SQL
    top_fr = [i for i, _ in rank(m, "interface accessibilité contraste", 5)]
    assert all(int(i[2:]) >= 10 for i in top_fr)


def test_semantic_none_for_tiny_corpus():
    assert build_model(corpus()[:5]) is None
