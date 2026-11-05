from crawler.cache import Cache
from crawler.models import Item, Source
from crawler.summarize import _parse, apply_summaries


def mk(h, desc="orig desc"):
    return Item(id=h, type="skill", name=h, summary=desc, summary_en=desc, source=Source(repo="o/r", url="u", path=h, origin="github"),
                lastCommit="2026-01-01T00:00:00Z", firstSeen="2026-01-01T00:00:00Z", contentHash=h)


def test_no_key_keeps_fallback_and_calls_nothing(tmp_path, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    def boom(*a, **k):
        raise AssertionError("aucun appel réseau sans clé")

    items = [mk("a"), mk("b")]
    stats = apply_summaries(items, Cache(tmp_path), caller=boom)
    assert stats == {"cached": 0, "generated": 0, "fallback": 2} and items[0].summary == "orig desc"


def test_generates_in_batches_caches_and_respects_budget(tmp_path, monkeypatch):
    monkeypatch.delenv("MAX_SUMMARIES_PER_RUN", raising=False)
    calls = []

    def fake(batch, key, model, client):
        calls.append([i.contentHash for i in batch])
        return {i.contentHash: (f"fr-{i.name}", f"en-{i.name}") for i in batch}

    cache = Cache(tmp_path)
    items = [mk(f"h{i}") for i in range(5)]
    stats = apply_summaries(items, cache, max_per_run=3, batch_size=2, api_key="k", caller=fake)
    assert calls == [["h0", "h1"], ["h2"]] and stats["generated"] == 3 and stats["fallback"] == 2   # budget = 3
    assert items[0].summary == "fr-h0" and items[0].summary_en == "en-h0" and items[4].summary == "orig desc"

    # 2e exécution : le cache sert h0-h2 (pas de regénération), le reste est généré
    items2 = [mk(f"h{i}") for i in range(5)]
    calls.clear()
    stats2 = apply_summaries(items2, cache, max_per_run=10, batch_size=10, api_key="k", caller=fake)
    assert stats2["cached"] == 3 and calls == [["h3", "h4"]]


def test_changed_hash_means_regeneration(tmp_path):
    cache = Cache(tmp_path)
    seen = []
    fake = lambda b, k, m, c: (seen.append(b[0].contentHash), {b[0].contentHash: ("f", "e")})[1]   # noqa: E731
    apply_summaries([mk("v1")], cache, api_key="k", caller=fake)
    apply_summaries([mk("v2")], cache, api_key="k", caller=fake)
    assert seen == ["v1", "v2"]


def test_api_failure_falls_back(tmp_path):
    import httpx

    def bad(*a, **k):
        raise httpx.ConnectError("down")

    items = [mk("a")]
    stats = apply_summaries(items, Cache(tmp_path), api_key="k", caller=bad)
    assert stats["generated"] == 0 and items[0].summary == "orig desc"


def test_parse_tolerates_wrapped_json():
    out = _parse('Voici :\n```json\n[{"id":"a","fr":"un","en":"one"},{"id":"b","fr":"","en":"x"},{"bad":1}]\n```')
    assert out == {"a": ("un", "one")}
    assert _parse("pas de json") == {}
