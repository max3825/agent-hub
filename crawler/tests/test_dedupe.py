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


def mk2(repo, name, summary, stars, h, path="p", t="skill"):
    it = mk(repo, stars, h, path, t)
    it.name, it.summary, it.summary_en = name, summary, summary
    return it


def test_normalize_name():
    from crawler.dedupe import normalize_name
    assert normalize_name("PDF-Skill") == normalize_name("pdf") == "pdf"
    assert normalize_name("claude_code_hooks_pdf") == "pdf"
    assert normalize_name("Postgres Migration Planner") == "postgresmigrationplanner"


def test_near_duplicate_same_name_close_summary_is_merged():
    a = mk2("orig/x", "pdf-forms", "Fills PDF forms from JSON data and validates required fields.", 500, "h1")
    b = mk2("copy/x", "PDF-Forms-Skill", "Fills PDF forms from JSON data and validates the required fields", 20, "h2", path="q")
    out = dedupe([b, a])
    assert [i.source.repo for i in out] == ["orig/x"]


def test_same_generic_name_different_purpose_is_kept():
    a = mk2("a/x", "formatter", "Formats Python code with Ruff after every edit by the agent.", 50, "h1")
    b = mk2("b/y", "formatter", "Renders citations and bibliographies in Markdown documents.", 40, "h2", path="q")
    assert len(dedupe([a, b])) == 2


def test_identical_long_summary_is_merged_but_not_across_types():
    s = "Lists open pull requests and summarizes review status for the team."
    a = mk2("a/x", "pr-list", s, 10, "h1")
    b = mk2("b/y", "totally-different-name", s, 90, "h2", path="q")
    c = mk2("c/z", "pr-list-hook", s, 5, "h3", path="r", t="hook")
    out = dedupe([a, b, c])
    assert {(i.type, i.source.repo) for i in out} == {("skill", "b/y"), ("hook", "c/z")}
