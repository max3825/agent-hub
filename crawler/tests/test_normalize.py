from datetime import datetime, timezone

from crawler.models import Detected, RepoMeta, content_hash, stable_id
from crawler.normalize import build_item, clean_text, extract_hook_commands, first_useful_sentence, infer_agents, parse_frontmatter

META = RepoMeta(full_name="Acme/Tools", stars=420, pushed_at="2026-10-30T10:00:00Z", license="MIT", default_branch="main", topics=["claude-code"])
NOW = datetime(2026, 11, 5, tzinfo=timezone.utc)


def test_frontmatter(fx):
    fm, body = parse_frontmatter(fx("SKILL.md"))
    assert fm["name"] == "pdf-forms-filler" and fm["tags"] == ["pdf", "forms"]
    assert body.lstrip().startswith("# PDF")
    assert parse_frontmatter("no frontmatter")[0] == {}
    assert parse_frontmatter("---\n: : bad yaml [\n---\nx")[0] == {}


def test_skill_item_uses_frontmatter_description(fx):
    d = Detected(type="skill", name="pdf", path="skills/pdf", main_file="skills/pdf/SKILL.md", rule="skill")
    it = build_item(d, META, fx("SKILL.md"), [], origin="github", now=NOW)
    assert it.name == "pdf-forms-filler"
    assert it.summary == "Fills PDF AcroForm forms from JSON data and validates required fields."
    assert it.id == stable_id("Acme/Tools", "skills/pdf") and len(it.id) == 16
    assert it.install == "npx skills add Acme/Tools --skill pdf"
    assert it.source.url == "https://github.com/Acme/Tools/tree/main/skills/pdf"
    assert it.license == "MIT" and it.stars == 420 and it.risk.level == "n/a"
    assert "Longer instructions" not in it.model_dump_json()           # jamais de contenu complet
    assert {"pdf", "forms"} <= set(it.tags)


def test_fallback_to_first_useful_sentence(fx):
    d = Detected(type="skill", name="weekly", path="weekly", main_file="weekly/SKILL.md", rule="skill")
    it = build_item(d, META, fx("SKILL_no_desc.md"), [], origin="awesome", now=NOW)
    assert it.summary.startswith("Generates a weekly status report")
    assert "badge" not in it.summary and it.source.origin == "awesome"


def test_hook_item_extracts_commands_and_scans(fx):
    d = Detected(type="hook", name="fmt", path="plugins/fmt/hooks", main_file="plugins/fmt/hooks/hooks.json", rule="hook", plugin="fmt", marketplace="mk")
    it = build_item(d, META, fx("hooks.json"), [], origin="marketplace", plugin_description="Formats on save", now=NOW)
    assert it.hookCommands == ['npx prettier --write "$CLAUDE_FILE_PATH"', "${CLAUDE_PLUGIN_ROOT}/hooks/guard.sh"]
    assert it.summary == "Format and guard" and it.risk.level == "low"   # la description propre du hook prime sur celle du plugin
    assert it.install == "/plugin marketplace add Acme/Tools\n/plugin install fmt@mk"


def test_evil_hook_is_high_risk(fx):
    d = Detected(type="hook", name="x", path="hooks", main_file="hooks/hooks.json", rule="hook")
    it = build_item(d, META, fx("hooks_evil.json"), [], origin="github", now=NOW)
    assert it.risk.level == "high" and any("curl|sh" in f for f in it.risk.flags)


def test_extra_scripts_are_scanned(fx):
    d = Detected(type="hook", name="x", path="hooks", main_file="hooks/hooks.json", rule="hook")
    it = build_item(d, META, fx("hooks.json"), ["#!/bin/sh\nrm -rf /tmp/cache"], origin="github", now=NOW)
    assert it.risk.level == "medium"


def test_content_hash_is_stable_and_whitespace_insensitive():
    assert content_hash("a", "x \r\ny") == content_hash("a", "x\ny")
    assert content_hash("a", "x") != content_hash("a", "y")


def test_helpers():
    assert extract_hook_commands("not json") == []
    assert clean_text("**Bold** [link](http://x) `code`") == "Bold link code"
    assert len(clean_text("word " * 100, 100)) <= 101
    assert first_useful_sentence("# T\n\n| a | b |\n\n```\ncode\n```\n") == ""
    assert infer_agents("works with Codex and Cursor") == ["claude-code", "codex", "cursor"]
    assert infer_agents("nothing") == ["claude-code"]


def test_markdown_mod_prose_does_not_raise_false_positive():
    d = Detected(type="mod", name="x-commands", path="commands", main_file="commands/x.md", rule="slash-command")
    it = build_item(d, META, "---\ndescription: Cleans up\n---\nDelete with rm -rf and never read .env or ~/.ssh", [], origin="github", now=NOW)
    assert it.risk.level == "n/a"
    d2 = Detected(type="mod", name="sl", path="statusline.sh", main_file="statusline.sh", rule="statusline")
    assert build_item(d2, META, "echo ok; rm -rf /tmp/x", [], origin="github", now=NOW).risk.level == "medium"   # script : analysé normalement
