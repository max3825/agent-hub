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


def test_app_hooks_skill_internal_and_generic_names():
    from crawler.quality import fix_name, is_app_hook, is_skill_internal
    def mk2(t, name, path):
        it = mk(name, path=path); it.type = t; return it
    assert is_app_hook(mk2("hook", "src", "web/src/hooks"))
    assert not is_app_hook(mk2("hook", "x", ".claude/hooks"))
    assert not is_app_hook(mk2("hook", "x", "hooks"))
    assert is_skill_internal(mk2("mod", "a", "skills/x/agents"))
    assert not is_skill_internal(mk2("mod", "a", "plugins/x/.claude-plugin"))
    i = mk2("hook", "src", "hooks"); fix_name(i); assert i.name == "r"
    i = mk2("mod", ".claude-commands", ".claude/commands"); fix_name(i); assert i.name.startswith("r")


def test_same_repo_same_summary_deduped():
    a, b = mk("a", path="x/a"), mk("b", path="x/b")
    kept, why = filter_items([a, b], QualityCfg())
    assert len(kept) == 1 and why["same_repo_same_summary"] == 1
