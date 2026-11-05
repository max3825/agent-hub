from crawler.config import QualityCfg, load_config
from crawler.models import Item, Source
from crawler.quality import filter_items, reject_reason

CFG = QualityCfg()


def mk(name, summary="Fills PDF forms from JSON data and validates fields.", path="skills/x", stars=50):
    return Item(id=f"{name}{path}", type="skill", name=name, summary=summary, summary_en=summary, source=Source(repo="o/r", url="u", path=path, origin="github"),
                stars=stars, lastCommit="2026-01-01T00:00:00Z", firstSeen="2026-01-01T00:00:00Z", contentHash=name + path)


def test_good_item_kept():
    assert reject_reason(mk("pdf-forms"), CFG) is None


def test_templates_and_examples_removed():
    assert reject_reason(mk("template-skill"), CFG) == "placeholder_name"
    assert reject_reason(mk("Example_Skill"), CFG) == "placeholder_name"
    assert reject_reason(mk("my-skill"), CFG) == "placeholder_name"
    assert reject_reason(mk("real-name", path="examples/real-name"), CFG) == "excluded_path"
    assert reject_reason(mk("real-name", path="docs/snippets/x"), CFG) == "excluded_path"


def test_legit_names_containing_those_words_survive():
    assert reject_reason(mk("test-driven-bugfix"), CFG) is None            # « test » seul est exclu, pas les composés
    assert reject_reason(mk("demonstrate-api"), CFG) is None
    assert reject_reason(mk("sampler"), CFG) is None


def test_placeholder_summaries():
    assert reject_reason(mk("x1", "Replace with description of the skill and when Claude should use it."), CFG) == "placeholder_summary"
    assert reject_reason(mk("x2", "TODO: write something"), CFG) == "placeholder_summary"
    assert reject_reason(mk("x3", "Lorem ipsum dolor sit amet consectetur"), CFG) == "placeholder_summary"


def test_undescribed_only_kept_when_popular():
    fallback = "Skill « abc » (o/r)."
    assert reject_reason(mk("abc", fallback, stars=20), CFG) == "no_description"
    assert reject_reason(mk("abc", fallback, stars=5000), CFG) is None
    assert reject_reason(mk("abc", "short", stars=20), CFG) == "no_description"


def test_filter_counts_and_disable():
    items = [mk("good"), mk("template-skill"), mk("y", "TODO: x"), mk("z", path="templates/z")]
    kept, why = filter_items(items, CFG)
    assert [i.name for i in kept] == ["good"] and dict(why) == {"placeholder_name": 1, "placeholder_summary": 1, "excluded_path": 1}
    assert filter_items(items, QualityCfg(enabled=False))[0] == items


def test_default_yaml_quality_section_loads():
    q = load_config().quality
    assert q.enabled and any("\\btodo\\b" in p for p in q.placeholder_summary_patterns) and "template-skill" in q.exclude_names
