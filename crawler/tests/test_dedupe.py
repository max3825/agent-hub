from crawler.dedupe import dedupe
from crawler.models import Item, Source


def mk(repo, stars, h="h1", path="p", t="skill"):
    return Item(id=f"{repo}:{path}", type=t, name="n", summary="s", summary_en="s", source=Source(repo=repo, url="u", path=path, origin="github"),
                stars=stars, lastCommit="2026-01-01T00:00:00Z", firstSeen="2026-01-01T00:00:00Z", contentHash=h)


def test_keeps_highest_stars():
    out = dedupe([mk("a/x", 10), mk("b/x", 500), mk("c/x", 50)])
    assert [i.source.repo for i in out] == ["b/x"]


def test_original_beats_fork_even_with_more_stars():
    out = dedupe([mk("fork/x", 900), mk("orig/x", 100)], forks={"fork/x"})
    assert [i.source.repo for i in out] == ["orig/x"]


def test_different_hash_or_type_kept():
    out = dedupe([mk("a/x", 1, "h1"), mk("a/y", 1, "h2", path="q"), mk("a/z", 1, "h1", path="r", t="hook")])
    assert len(out) == 3


def test_order_preserved_and_same_id_unique():
    a, b = mk("a/x", 5, "h1", "p"), mk("b/y", 5, "h2", "q")
    assert dedupe([a, b, a]) == [a, b]
