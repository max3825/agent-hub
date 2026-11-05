from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = Path(__file__).with_name("sources.yaml")


class GithubCfg(BaseModel):
    topics: list[str] = []
    min_stars: int = 20
    max_inactive_days: int = 540
    skip_forks: bool = True
    max_repos: int = 600
    max_items_per_repo: int = 80
    max_tree_entries: int = 30000
    max_topic_pages: int = 3
    max_creation_lookups: int = 120   # recherches « date du 1er commit » par exécution (2 requêtes chacune)
    max_runtime_minutes: int = 0      # 0 = illimité ; sinon le crawl s'arrête proprement et reprend au prochain run


class AwesomeList(BaseModel):
    repo: str
    path: str = "README.md"


class CodeSearchCfg(BaseModel):
    enabled: bool = True
    max_pages: int = 2
    queries: list[str] = []


class SkillsShCfg(BaseModel):
    enabled: bool = True
    base_url: str = "https://skills.sh"
    timeout: float = 15


class ModRule(BaseModel):
    id: str
    glob: str
    scope: str = "file"  # file | dir
    tags: list[str] = []


class DetectionCfg(BaseModel):
    skill: list[str] = ["**/SKILL.md"]
    hook: list[str] = ["**/hooks/hooks.json", "hooks.json"]
    hook_dirs: list[str] = ["**/hooks"]
    hook_script_ext: list[str] = [".sh", ".py", ".js", ".ts"]
    mods: list[ModRule] = []
    mod_min_confidence: float = 0.5   # en dessous, la détection d'un mod est écartée


class QualityCfg(BaseModel):
    enabled: bool = True
    exclude_paths: list[str] = [
        "**/examples/**", "**/example/**", "**/templates/**", "**/template/**", "**/samples/**", "**/sample/**",
        "**/demo/**", "**/docs/**", "**/.github/**", "**/archive/**", "**/deprecated/**", "**/legacy/**",
    ]
    exclude_names: list[str] = ["template", "template-skill", "example", "examples", "sample", "demo", "test", "hello-world", "my-skill", "skill-name", "your-skill-name", "new-skill"]
    exclude_name_patterns: list[str] = ["^(template|example|sample|demo|placeholder)(-|$)", "^(my|your|new)-(skill|hook|plugin|mod)$"]
    placeholder_summary_patterns: list[str] = [
        r"replace (this )?with (a )?description", r"lorem ipsum", r"your description (here)?", r"description of (what )?the skill",
        r"\btodo\b[: ]", r"^(add|write) (a )?description", r"describe (what )?your (skill|hook|plugin)",
    ]
    min_summary_len: int = 15
    undescribed_min_stars: int = 200


class SummariesCfg(BaseModel):
    max_per_run: int = 300
    batch_size: int = 10


class Config(BaseModel):
    github: GithubCfg = Field(default_factory=GithubCfg)
    seed_repos: list[str] = []
    marketplaces: list[str] = []
    awesome_lists: list[AwesomeList] = []
    code_search: CodeSearchCfg = Field(default_factory=CodeSearchCfg)
    skills_sh: SkillsShCfg = Field(default_factory=SkillsShCfg)
    detection: DetectionCfg = Field(default_factory=DetectionCfg)
    summaries: SummariesCfg = Field(default_factory=SummariesCfg)
    quality: QualityCfg = Field(default_factory=QualityCfg)


def load_config(path: Path | str | None = None) -> Config:
    p = Path(path) if path else DEFAULT_CONFIG
    return Config.model_validate(yaml.safe_load(p.read_text(encoding="utf-8")) or {})
