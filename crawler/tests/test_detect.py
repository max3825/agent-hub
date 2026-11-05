from crawler.config import load_config
from crawler.detect import detect, matches

CFG = load_config().detection


def by(found, t):
    return {(d.name, d.path) for d in found if d.type == t}


def test_glob_semantics():
    assert matches("SKILL.md", "**/SKILL.md")              # ** = zéro dossier
    assert matches("a/b/SKILL.md", "**/SKILL.md")
    assert not matches("a/SKILL.mdx", "**/SKILL.md")
    assert matches("x/statusline.sh", "**/statusline*.{sh,py}")
    assert not matches("x/statusline.rb", "**/statusline*.{sh,py}")
    assert matches("commands/a.md", "**/commands/*.md") and not matches("commands/a/b.md", "**/commands/*.md")


def test_skills_detected_and_noise_ignored(tree):
    f = detect(tree, CFG, "repo")
    assert by(f, "skill") == {("pdf", "skills/pdf"), ("docx", "skills/docx")}   # node_modules/ et tests/ exclus


def test_hooks_json_and_script_dir(tree):
    f = detect(tree, CFG, "repo")
    hooks = by(f, "hook")
    assert ("fmt", "plugins/fmt/hooks") in hooks
    assert ("tools", "tools/hooks") in hooks             # dossier hooks/ sans hooks.json
    fmt = next(d for d in f if d.path == "plugins/fmt/hooks")
    assert fmt.main_file.endswith("hooks.json") and fmt.rule == "hook"   # hooks.json prioritaire


def test_mods_only_through_configured_rules(tree):
    f = detect(tree, CFG, "repo")
    rules = {d.rule for d in f if d.type == "mod"}
    assert {"slash-command", "statusline-dir", "output-style", "plugin"} <= rules
    cmds = [d for d in f if d.rule == "slash-command"]
    assert len(cmds) == 1 and cmds[0].path == "plugins/fmt/commands"      # scope dir : un mod pour 2 fichiers
    assert not any(d.path == "src/app.py" for d in f)


def test_no_mod_rules_means_no_mods(tree):
    cfg = CFG.model_copy(update={"mods": []})
    assert not [d for d in detect(tree, cfg) if d.type == "mod"]


def test_root_skill_uses_repo_name():
    f = detect(["SKILL.md"], CFG, "my-repo")
    assert f[0].name == "my-repo" and f[0].path == "."
